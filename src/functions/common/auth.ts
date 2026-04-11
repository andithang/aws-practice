import { APIGatewayProxyEvent } from 'aws-lambda';
import { getParameterJson } from './aws';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from './log';

export interface AuthResult {
  ok: boolean;
  message?: string;
}

export async function validateAdminToken(event: APIGatewayProxyEvent): Promise<AuthResult> {
  const logFields = { component: 'common-auth', ...apiRequestLogFields(event) };
  const auth = event.headers.authorization || event.headers.Authorization;
  if (!auth?.startsWith('Bearer ')) {
    logWarn('Authorization header missing or malformed', logFields);
    return { ok: false, message: 'Invalid authorization header' };
  }

  try {
    const token = auth.replace('Bearer ', '').trim();
    const secret = await getParameterJson(process.env.ADMIN_TOKEN_PARAMETER_NAME!);
    const isValid = token === secret.token;

    if (!isValid) {
      logWarn('Admin token verification failed', logFields);
      return { ok: false, message: 'Invalid admin token' };
    }

    logInfo('Admin token verified', logFields);
    return { ok: true };
  } catch (error) {
    logError('Admin token verification failed with error', {
      ...logFields,
      ...errorLogFields(error)
    });
    return { ok: false, message: 'Authentication failed' };
  }
}

export async function verifyAdminToken(event: APIGatewayProxyEvent): Promise<boolean> {
  const result = await validateAdminToken(event);
  return result.ok;
}
