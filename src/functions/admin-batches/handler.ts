import { APIGatewayProxyHandler } from 'aws-lambda';
import { verifyAdminToken } from '../common/auth';
import { queryByPk } from '../common/aws';
import { json } from '../common/http';
import { apiRequestLogFields, errorLogFields, logError, logInfo, logWarn } from '../common/log';

const levels = ['practitioner', 'associate', 'professional'];

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'admin-batches', ...apiRequestLogFields(event) };
  logInfo('Request received', requestFields);

  try {
    if (!(await verifyAdminToken(event))) {
      logWarn('Unauthorized request', requestFields);
      return json(401, { message: 'Unauthorized' });
    }

    const all = await Promise.all(levels.map((level) => queryByPk(`LEVEL#${level}`)));
    const batches = all.flatMap((result) => (result.Items || []).filter((item) => item.entityType === 'BATCH'));
    logInfo('Fetched admin batches', { ...requestFields, batchCount: batches.length });
    return json(200, { batches });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    throw error;
  }
};
