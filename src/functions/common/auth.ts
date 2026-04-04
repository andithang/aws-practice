import { APIGatewayProxyEvent } from 'aws-lambda';
import { getSecretJson } from './aws';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from './log';

export async function verifyAdminToken(event: APIGatewayProxyEvent): Promise<boolean> {
  const logFields = { component: 'common-auth', ...apiRequestLogFields(event) };
  const auth = event.headers.authorization || event.headers.Authorization;
  if (!auth?.startsWith('Bearer ')) {
    logWarn('Authorization header missing or malformed', logFields);
    return false;
  }

  try {
    const token = auth.replace('Bearer ', '').trim();
    const secret = await getSecretJson(process.env.ADMIN_TOKEN_SECRET_ID!);
    const isValid = token === secret.token;

    if (!isValid) {
      logWarn('Admin token verification failed', logFields);
      return false;
    }

    logInfo('Admin token verified', logFields);
    return true;
  } catch (error) {
    logError('Admin token verification failed with error', {
      ...logFields,
      ...errorLogFields(error)
    });
    throw error;
  }
}
