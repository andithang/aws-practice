import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/functions/common/device', () => ({
  validateDeviceForEvent: vi.fn(),
  enrichDeviceIdentityForEvent: vi.fn()
}));

vi.mock('../src/functions/common/aws', () => ({
  queryAllByPk: vi.fn()
}));

vi.mock('../src/functions/common/practice-answer-store', () => ({
  loadPracticeAnswersForUser: vi.fn()
}));

import { handler } from '../src/functions/practice-questions/handler';
import { queryAllByPk } from '../src/functions/common/aws';
import { enrichDeviceIdentityForEvent, validateDeviceForEvent } from '../src/functions/common/device';
import { loadPracticeAnswersForUser } from '../src/functions/common/practice-answer-store';

function buildEvent(
  queryStringParameters: Record<string, string> = {}
): Parameters<typeof handler>[0] {
  return {
    headers: {},
    httpMethod: 'GET',
    path: '/api/practice/questions',
    body: null,
    pathParameters: null,
    queryStringParameters,
    requestContext: {
      requestId: 'req-practice-1',
      authorizer: {
        claims: {
          sub: 'user-sub-1'
        }
      }
    }
  } as never;
}

function buildQuestion(index: number) {
  const id = String(index).padStart(3, '0');
  return {
    PK: 'LEVEL#associate',
    SK: `QUESTION#${id}`,
    entityType: 'QUESTION',
    isPublished: true,
    createdAt: `2026-04-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    stem: `Question ${index + 1}`,
    options: [{ key: 'A', text: 'Option A' }],
    correctAnswers: ['A']
  };
}

describe('practice-questions handler pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateDeviceForEvent).mockResolvedValue({ ok: true, deviceId: 'device-1' });
    vi.mocked(enrichDeviceIdentityForEvent).mockResolvedValue();
    vi.mocked(queryAllByPk).mockResolvedValue(Array.from({ length: 120 }, (_, index) => buildQuestion(index)));
    vi.mocked(loadPracticeAnswersForUser).mockResolvedValue({});
  });

  it('returns currentPageIndex for the first page', async () => {
    const response = await handler(
      buildEvent({
        level: 'associate',
        page: '1',
        size: '10',
        window: '0'
      })
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.pagination.currentPageIndex).toBe(1);
  });

  it('returns currentPageIndex after window rollover', async () => {
    const response = await handler(
      buildEvent({
        level: 'associate',
        page: '11',
        size: '10',
        window: '0'
      })
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.pagination.effectiveWindow).toBe(1);
    expect(body.pagination.effectivePage).toBe(1);
    expect(body.pagination.currentPageIndex).toBe(11);
  });

  it('returns persistedAnswers for page questions', async () => {
    vi.mocked(loadPracticeAnswersForUser).mockResolvedValue({
      [`question-119_${'2026-04-01T00:00:119.000Z'}`]: ['A']
    });
    const response = await handler(
      buildEvent({
        level: 'associate',
        page: '1',
        size: '1',
        window: '0'
      })
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.persistedAnswers).toBeDefined();
    expect(vi.mocked(loadPracticeAnswersForUser)).toHaveBeenCalled();
    expect(vi.mocked(enrichDeviceIdentityForEvent)).toHaveBeenCalledWith(expect.any(Object), 'device-1');
  });

  it('returns 401 when cognito sub is missing and does not enrich', async () => {
    const response = await handler({
      ...buildEvent({ level: 'associate' }),
      requestContext: {
        requestId: 'req-practice-1',
        authorizer: {}
      }
    } as never);

    expect(response.statusCode).toBe(401);
    expect(vi.mocked(enrichDeviceIdentityForEvent)).not.toHaveBeenCalled();
  });

  it('returns device validation error before enrichment', async () => {
    vi.mocked(validateDeviceForEvent).mockResolvedValue({ ok: false, statusCode: 428, message: 'Device id expired' });

    const response = await handler(
      buildEvent({
        level: 'associate',
        page: '1',
        size: '10',
        window: '0'
      })
    );

    expect(response.statusCode).toBe(428);
    expect(vi.mocked(enrichDeviceIdentityForEvent)).not.toHaveBeenCalled();
  });
});
