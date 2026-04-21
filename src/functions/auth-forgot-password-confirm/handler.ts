import { APIGatewayProxyHandler } from 'aws-lambda';
import { createHash } from 'crypto';
import { CognitoPasswordResetError, confirmForgotPassword } from '../common/cognito-password-reset';
import { validateDeviceForEvent } from '../common/device';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';

type ConfirmBody = {
  email?: unknown;
  code?: unknown;
  newPassword?: unknown;
};

function parseBody(body: string | null): ConfirmBody {
  try {
    return JSON.parse(body || '{}') as ConfirmBody;
  } catch {
    return {};
  }
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeCode(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePassword(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidCode(code: string): boolean {
  return /^[A-Za-z0-9]{6,12}$/.test(code);
}

function emailHash(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 16);
}

function isThrottledError(error: unknown): boolean {
  return error instanceof CognitoPasswordResetError
    && (error.code === 'TooManyRequestsException' || error.code === 'LimitExceededException');
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'auth-forgot-password-confirm', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    const deviceValidation = await validateDeviceForEvent(event);
    if (!deviceValidation.ok) {
      logWarn('Device validation failed', { ...requestFields, deviceMessage: deviceValidation.message });
      return json(deviceValidation.statusCode, { message: deviceValidation.message });
    }

    const body = parseBody(event.body);
    const email = normalizeEmail(body.email);
    const code = normalizeCode(body.code);
    const newPassword = normalizePassword(body.newPassword);

    if (!email) return json(400, { message: 'email is required' });
    if (!isValidEmail(email)) return json(400, { message: 'email must be a valid email address' });
    if (!code) return json(400, { message: 'code is required' });
    if (!isValidCode(code)) return json(400, { message: 'code must be 6-12 alphanumeric characters' });
    if (!newPassword) return json(400, { message: 'newPassword is required' });
    if (newPassword.length < 8) return json(400, { message: 'newPassword must be at least 8 characters' });

    try {
      await confirmForgotPassword({ email, code, newPassword });
      logInfo('Forgot password confirm accepted', {
        ...requestFields,
        emailHash: emailHash(email)
      });
      return json(200, { message: 'Password reset successful.' });
    } catch (error) {
      if (isThrottledError(error)) {
        logWarn('Forgot password confirm throttled', {
          ...requestFields,
          emailHash: emailHash(email),
          code: (error as CognitoPasswordResetError).code
        });
        return json(429, { message: 'Too many reset attempts. Please try again later.' });
      }

      logWarn('Forgot password confirm rejected', {
        ...requestFields,
        emailHash: emailHash(email),
        ...errorLogFields(error)
      });
      return json(400, { message: 'Unable to reset password. Check the code and password requirements.' });
    }
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    return json(500, { message: 'Internal server error' });
  }
};
