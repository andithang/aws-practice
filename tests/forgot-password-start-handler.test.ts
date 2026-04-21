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
  startForgotPassword: vi.fn()
}));

import { handler } from '../src/functions/auth-forgot-password-start/handler';
import { validateDeviceForEvent } from '../src/functions/common/device';
import { CognitoPasswordResetError, startForgotPassword } from '../src/functions/common/cognito-password-reset';

function buildEvent(body: unknown): Parameters<typeof handler>[0] {
  return {
    headers: { 'X-Device-Id': 'device-1' },
    httpMethod: 'POST',
    path: '/api/auth/forgot-password/start',
    body: JSON.stringify(body),
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      requestId: 'req-forgot-start-1'
    }
  } as never;
}

describe('forgot-password start handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateDeviceForEvent).mockResolvedValue({ ok: true });
    vi.mocked(startForgotPassword).mockResolvedValue();
  });

  it('returns a generic success response for valid requests', async () => {
    const response = await handler(buildEvent({ email: 'USER@example.com ' }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      message: 'If the account exists, a reset code has been sent.'
    });
    expect(startForgotPassword).toHaveBeenCalledWith('user@example.com');
  });

  it('returns generic success when cognito reports non-throttling errors', async () => {
    vi.mocked(startForgotPassword).mockRejectedValue(new CognitoPasswordResetError('UserNotFoundException', 'no user'));

    const response = await handler(buildEvent({ email: 'missing@example.com' }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      message: 'If the account exists, a reset code has been sent.'
    });
  });

  it('returns 400 for malformed input', async () => {
    const response = await handler(buildEvent({ email: '' }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ message: 'email is required' });
    expect(startForgotPassword).not.toHaveBeenCalled();
  });

  it('returns 428 when device validation fails', async () => {
    vi.mocked(validateDeviceForEvent).mockResolvedValue({
      ok: false,
      statusCode: 428,
      message: 'Device id is required'
    });

    const response = await handler(buildEvent({ email: 'user@example.com' }));

    expect(response.statusCode).toBe(428);
    expect(JSON.parse(response.body)).toEqual({ message: 'Device id is required' });
    expect(startForgotPassword).not.toHaveBeenCalled();
  });

  it('returns 429 when cognito is throttling', async () => {
    vi.mocked(startForgotPassword).mockRejectedValue(
      new CognitoPasswordResetError('TooManyRequestsException', 'slow down')
    );

    const response = await handler(buildEvent({ email: 'user@example.com' }));

    expect(response.statusCode).toBe(429);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Too many reset attempts. Please try again later.'
    });
  });
});
