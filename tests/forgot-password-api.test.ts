import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../frontend/lib/api-client', () => ({
  apiRequest: vi.fn()
}));

import { apiRequest } from '../frontend/lib/api-client';
import { confirmForgotPassword, requestForgotPassword, ResetPasswordApiError } from '../frontend/lib/forgot-password-api';

describe('forgot-password api client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests password reset with generic success', async () => {
    vi.mocked(apiRequest).mockResolvedValue(
      new Response(JSON.stringify({ message: 'If the account exists, a reset code has been sent.' }), { status: 200 })
    );

    await expect(requestForgotPassword('user@example.com')).resolves.toEqual({
      message: 'If the account exists, a reset code has been sent.'
    });
  });

  it('maps confirm bad-request errors to ResetPasswordApiError', async () => {
    vi.mocked(apiRequest).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unable to reset password. Check the code and password requirements.' }), { status: 400 })
    );

    await expect(
      confirmForgotPassword({
        email: 'user@example.com',
        code: '123456',
        newPassword: 'Password123'
      })
    ).rejects.toEqual(
      new ResetPasswordApiError('Unable to reset password. Check the code and password requirements.', 400)
    );
  });

  it('maps throttling status to a safe user-facing error', async () => {
    vi.mocked(apiRequest).mockResolvedValue(
      new Response(JSON.stringify({ message: 'Too many reset attempts. Please try again later.' }), { status: 429 })
    );

    await expect(requestForgotPassword('user@example.com')).rejects.toEqual(
      new ResetPasswordApiError('Too many reset attempts. Please try again later.', 429)
    );
  });
});
