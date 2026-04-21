import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/functions/common/device', () => ({
  validateDeviceForEvent: vi.fn()
}));

vi.mock('../src/functions/common/cognito-password-reset', () => ({
  CognitoPasswordResetError: class CognitoPasswordResetError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = 'CognitoPasswordResetError';
      this.code = code;
    }
  },
  confirmForgotPassword: vi.fn()
}));

import { handler } from '../src/functions/auth-forgot-password-confirm/handler';
import { validateDeviceForEvent } from '../src/functions/common/device';
import { CognitoPasswordResetError, confirmForgotPassword } from '../src/functions/common/cognito-password-reset';

function buildEvent(body: unknown): Parameters<typeof handler>[0] {
  return {
    headers: { 'X-Device-Id': 'device-1' },
    httpMethod: 'POST',
    path: '/api/auth/forgot-password/confirm',
    body: JSON.stringify(body),
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      requestId: 'req-forgot-confirm-1'
    }
  } as never;
}

describe('forgot-password confirm handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateDeviceForEvent).mockResolvedValue({ ok: true });
    vi.mocked(confirmForgotPassword).mockResolvedValue();
  });

  it('returns success for valid confirm requests', async () => {
    const response = await handler(
      buildEvent({
        email: 'USER@example.com ',
        code: '123456',
        newPassword: 'Password123'
      })
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Password reset successful.'
    });
    expect(confirmForgotPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      code: '123456',
      newPassword: 'Password123'
    });
  });

  it('returns 400 for malformed request body', async () => {
    const response = await handler(
      buildEvent({
        email: 'user@example.com',
        code: '',
        newPassword: 'short'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ message: 'code is required' });
    expect(confirmForgotPassword).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid code or password policy errors', async () => {
    vi.mocked(confirmForgotPassword).mockRejectedValue(
      new CognitoPasswordResetError('CodeMismatchException', 'wrong code')
    );

    const response = await handler(
      buildEvent({
        email: 'user@example.com',
        code: '123456',
        newPassword: 'Password123'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Unable to reset password. Check the code and password requirements.'
    });
  });

  it('returns 429 when cognito is throttling', async () => {
    vi.mocked(confirmForgotPassword).mockRejectedValue(
      new CognitoPasswordResetError('LimitExceededException', 'rate limited')
    );

    const response = await handler(
      buildEvent({
        email: 'user@example.com',
        code: '123456',
        newPassword: 'Password123'
      })
    );

    expect(response.statusCode).toBe(429);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Too many reset attempts. Please try again later.'
    });
  });

  it('returns 428 when device validation fails', async () => {
    vi.mocked(validateDeviceForEvent).mockResolvedValue({
      ok: false,
      statusCode: 428,
      message: 'Device id is unknown'
    });

    const response = await handler(
      buildEvent({
        email: 'user@example.com',
        code: '123456',
        newPassword: 'Password123'
      })
    );

    expect(response.statusCode).toBe(428);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Device id is unknown'
    });
    expect(confirmForgotPassword).not.toHaveBeenCalled();
  });
});
