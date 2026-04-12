import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/functions/common/device', () => ({
  validateDeviceForEvent: vi.fn()
}));

vi.mock('../src/functions/common/aws', () => ({
  queryAllByPk: vi.fn()
}));

import { handler } from '../src/functions/practice-questions/handler';
import { queryAllByPk } from '../src/functions/common/aws';
import { validateDeviceForEvent } from '../src/functions/common/device';

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
    requestContext: { requestId: 'req-practice-1' }
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
    vi.mocked(validateDeviceForEvent).mockResolvedValue({ ok: true });
    vi.mocked(queryAllByPk).mockResolvedValue(Array.from({ length: 120 }, (_, index) => buildQuestion(index)));
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
});
