import { apiRequest } from './api-client';

type MessageResponse = {
  message: string;
};

type ConfirmForgotPasswordInput = {
  email: string;
  code: string;
  newPassword: string;
};

export class ResetPasswordApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ResetPasswordApiError';
    this.statusCode = statusCode;
  }
}

async function parseMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (!text) return fallback;

  try {
    const payload = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
    return fallback;
  } catch {
    return fallback;
  }
}

async function unwrapMessageResponse(response: Response, fallback: string): Promise<MessageResponse> {
  const message = await parseMessage(response, fallback);
  return { message };
}

export async function requestForgotPassword(email: string): Promise<MessageResponse> {
  const response = await apiRequest('/api/auth/forgot-password/start', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() })
  });

  if (response.ok) {
    return unwrapMessageResponse(response, 'If the account exists, a reset code has been sent.');
  }

  const message = await parseMessage(response, 'Unable to process password reset request.');
  throw new ResetPasswordApiError(message, response.status);
}

export async function confirmForgotPassword(input: ConfirmForgotPasswordInput): Promise<MessageResponse> {
  const response = await apiRequest('/api/auth/forgot-password/confirm', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email.trim(),
      code: input.code.trim(),
      newPassword: input.newPassword
    })
  });

  if (response.ok) {
    return unwrapMessageResponse(response, 'Password reset successful.');
  }

  const message = await parseMessage(response, 'Unable to reset password.');
  throw new ResetPasswordApiError(message, response.status);
}
