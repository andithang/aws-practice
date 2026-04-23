import { APIGatewayProxyEvent } from 'aws-lambda';
import { isAdminUserFromEvent } from './cognito-auth';
import { apiRequestLogFields, logInfo, logWarn } from './log';

export interface AuthResult {
  ok: boolean;
  message?: string;
}

export async function validateAdminAccess(event: APIGatewayProxyEvent): Promise<AuthResult> {
  const logFields = { component: 'common-auth', ...apiRequestLogFields(event) };
  if (!isAdminUserFromEvent(event)) {
    logWarn('Admin claim verification failed', logFields);
    return { ok: false, message: 'Admin access required' };
  }

  logInfo('Admin claim verified', logFields);
  return { ok: true };
}

export async function verifyAdminAccess(event: APIGatewayProxyEvent): Promise<boolean> {
  const result = await validateAdminAccess(event);
  return result.ok;
}
