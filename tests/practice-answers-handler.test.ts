import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/functions/common/device', () => ({
  validateDeviceForEvent: vi.fn(),
  enrichDeviceIdentityForEvent: vi.fn()
}));

vi.mock('../src/functions/common/practice-answer-store', () => ({
  upsertPracticeAnswerForUser: vi.fn(),
  deletePracticeAnswerForUser: vi.fn()
}));

import { handler as saveHandler } from '../src/functions/practice-answers-save/handler';
import { handler as deleteHandler } from '../src/functions/practice-answers-delete/handler';
import { enrichDeviceIdentityForEvent, validateDeviceForEvent } from '../src/functions/common/device';
import { deletePracticeAnswerForUser, upsertPracticeAnswerForUser } from '../src/functions/common/practice-answer-store';

function buildRequestContext(sub?: string) {
  return {
    requestId: 'req-answers-1',
    authorizer: sub
      ? {
          claims: {
            sub
          }
        }
      : {}
  } as never;
}

describe('practice answer handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateDeviceForEvent).mockResolvedValue({ ok: true, deviceId: 'device-1' });
    vi.mocked(enrichDeviceIdentityForEvent).mockResolvedValue();
  });

  it('saves selected answers for authenticated user', async () => {
    const response = await saveHandler({
      headers: { 'X-Device-Id': 'device-1' },
      requestContext: buildRequestContext('user-sub-1'),
      body: JSON.stringify({
        questionKey: 'q-1',
        selectedAnswers: ['A'],
        level: 'associate'
      })
    } as never);

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(upsertPracticeAnswerForUser)).toHaveBeenCalledWith({
      userSub: 'user-sub-1',
      questionKey: 'q-1',
      selectedAnswers: ['A'],
      level: 'associate'
    });
    expect(vi.mocked(enrichDeviceIdentityForEvent)).toHaveBeenCalledWith(expect.any(Object), 'device-1');
  });

  it('deletes selected answers for authenticated user', async () => {
    const response = await deleteHandler({
      headers: { 'X-Device-Id': 'device-1' },
      requestContext: buildRequestContext('user-sub-1'),
      body: JSON.stringify({
        questionKey: 'q-1'
      })
    } as never);

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(deletePracticeAnswerForUser)).toHaveBeenCalledWith({
      userSub: 'user-sub-1',
      questionKey: 'q-1'
    });
    expect(vi.mocked(enrichDeviceIdentityForEvent)).toHaveBeenCalledWith(expect.any(Object), 'device-1');
  });

  it('returns 401 when cognito sub is missing', async () => {
    const response = await saveHandler({
      headers: { 'X-Device-Id': 'device-1' },
      requestContext: buildRequestContext(),
      body: JSON.stringify({
        questionKey: 'q-1',
        selectedAnswers: ['A']
      })
    } as never);

    expect(response.statusCode).toBe(401);
    expect(vi.mocked(upsertPracticeAnswerForUser)).not.toHaveBeenCalled();
    expect(vi.mocked(enrichDeviceIdentityForEvent)).not.toHaveBeenCalled();
  });

  it('returns device validation errors before enrichment and answer writes', async () => {
    vi.mocked(validateDeviceForEvent).mockResolvedValue({ ok: false, statusCode: 428, message: 'Device id expired' });

    const response = await saveHandler({
      headers: { 'X-Device-Id': 'device-1' },
      requestContext: buildRequestContext('user-sub-1'),
      body: JSON.stringify({
        questionKey: 'q-1',
        selectedAnswers: ['A']
      })
    } as never);

    expect(response.statusCode).toBe(428);
    expect(vi.mocked(enrichDeviceIdentityForEvent)).not.toHaveBeenCalled();
    expect(vi.mocked(upsertPracticeAnswerForUser)).not.toHaveBeenCalled();
  });
});
