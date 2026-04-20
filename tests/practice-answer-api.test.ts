import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../frontend/lib/api-client', () => ({
  apiRequest: vi.fn()
}));

import { apiRequest } from '../frontend/lib/api-client';
import { clearPracticeAnswer, savePracticeAnswer } from '../frontend/lib/practice-answer-api';

describe('practice answer api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves answer with POST /api/practice/answers', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await savePracticeAnswer({
      questionKey: 'q-1',
      selectedAnswers: ['A'],
      level: 'associate'
    });

    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith(
      '/api/practice/answers',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });

  it('clears answer with DELETE /api/practice/answers', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await clearPracticeAnswer('q-1');

    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith(
      '/api/practice/answers',
      expect.objectContaining({
        method: 'DELETE'
      })
    );
  });
});
