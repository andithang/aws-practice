import { APIGatewayProxyHandler } from 'aws-lambda';
import { validateDeviceForEvent } from '../common/device';
import { verifyAdminAccess } from '../common/auth';
import { generateAndPersistBatch } from '../common/generation';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'admin-generate', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    const deviceValidation = await validateDeviceForEvent(event);
    if (!deviceValidation.ok) {
      logWarn('Device validation failed', { ...requestFields, message: deviceValidation.message });
      return json(deviceValidation.statusCode, { message: deviceValidation.message });
    }

    if (!(await verifyAdminAccess(event))) {
      logWarn('Unauthorized request', requestFields);
      return json(401, { message: 'Unauthorized' });
    }

    const result = await generateAndPersistBatch();
    logInfo('Batch generated', { ...requestFields, ...result });
    return json(200, { ok: true, ...result });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    throw error;
  }
};

