import { APIGatewayProxyHandler } from 'aws-lambda';
import { verifyAdminToken } from '../common/auth';
import { updateStatus } from '../common/aws';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'admin-batch-deprecate', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    if (!(await verifyAdminToken(event))) {
      logWarn('Unauthorized request', requestFields);
      return json(401, { message: 'Unauthorized' });
    }

    const batchId = event.pathParameters?.batchId;
    const body = JSON.parse(event.body || '{}');
    const level = body.level;
    const date = body.date;
    const pk = `LEVEL#${level}`;
    const sk = `DATE#${date}#BATCH#${batchId}`;

    await updateStatus(pk, sk, 'deprecated');
    logInfo('Batch status updated to deprecated', { ...requestFields, batchId, level, date });
    return json(200, { ok: true });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    throw error;
  }
};
