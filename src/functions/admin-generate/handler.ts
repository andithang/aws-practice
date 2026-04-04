import { APIGatewayProxyHandler } from 'aws-lambda';
import { verifyAdminToken } from '../common/auth';
import { generateAndPersistBatch } from '../common/generation';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'admin-generate', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    if (!(await verifyAdminToken(event))) {
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
