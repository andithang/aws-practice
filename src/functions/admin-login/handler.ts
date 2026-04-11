import { APIGatewayProxyHandler } from 'aws-lambda';
import { validateDeviceForEvent } from '../common/device';
import { getParameterValue } from '../common/aws';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'admin-login', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    const deviceValidation = await validateDeviceForEvent(event);
    if (!deviceValidation.ok) {
      logWarn('Device validation failed', { ...requestFields, message: deviceValidation.message });
      return json(deviceValidation.statusCode, { message: deviceValidation.message });
    }

    const body = JSON.parse(event.body || '{}');
    if (!body.token) {
      logWarn('Missing token in request body', requestFields);
    }

    const adminToken = await getParameterValue(process.env.ADMIN_TOKEN_PARAMETER_NAME!);
    const ok = body.token && body.token === adminToken;
    logInfo('Login request evaluated', { ...requestFields, ok });
    return json(ok ? 200 : 401, { ok });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    throw error;
  }
};
