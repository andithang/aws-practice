import { APIGatewayProxyHandler } from 'aws-lambda';
import { createHash } from 'crypto';
import { CognitoPasswordResetError, startForgotPassword } from '../common/cognito-password-reset';
import { validateDeviceForEvent } from '../common/device';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';

const genericResponse = { message: 'If the account exists, a reset code has been sent.' };

type StartBody = {
  email?: unknown;
};

function parseBody(body: string | null): StartBody {
  try {
    return JSON.parse(body || '{}') as StartBody;
  } catch {
    return {};
  }
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function emailHash(email: string): string {
  return createHash('sha256').update(email).digest('hex').slice(0, 16);
}

function isThrottledError(error: unknown): boolean {
  return error instanceof CognitoPasswordResetError
    && (error.code === 'TooManyRequestsException' || error.code === 'LimitExceededException');
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'auth-forgot-password-start', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    const deviceValidation = await validateDeviceForEvent(event);
    if (!deviceValidation.ok) {
      logWarn('Device validation failed', { ...requestFields, deviceMessage: deviceValidation.message });
      return json(deviceValidation.statusCode, { message: deviceValidation.message });
    }

    const body = parseBody(event.body);
    const email = normalizeEmail(body.email);
    if (!email) {
      return json(400, { message: 'email is required' });
    }
    if (!isValidEmail(email)) {
      return json(400, { message: 'email must be a valid email address' });
    }

    const safeFields = { ...requestFields, emailHash: emailHash(email) };
    try {
      await startForgotPassword(email);
      logInfo('Forgot password start accepted', safeFields);
      return json(200, genericResponse);
    } catch (error) {
      if (isThrottledError(error)) {
        logWarn('Forgot password start throttled', {
          ...safeFields,
          code: (error as CognitoPasswordResetError).code
        });
        return json(429, { message: 'Too many reset attempts. Please try again later.' });
      }

      logWarn('Forgot password start returned generic success after Cognito error', {
        ...safeFields,
        ...errorLogFields(error)
      });
      return json(200, genericResponse);
    }
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    return json(500, { message: 'Internal server error' });
  }
};
