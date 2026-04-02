import { APIGatewayProxyHandler } from 'aws-lambda';
import { verifyAdminToken } from '../common/auth';
import { queryByPk } from '../common/aws';

const levels = ['practitioner', 'associate', 'professional'];

export const handler: APIGatewayProxyHandler = async (event) => {
  if (!(await verifyAdminToken(event))) return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };

  const all = await Promise.all(levels.map((l) => queryByPk(`LEVEL#${l}`)));
  const batches = all.flatMap((r) => (r.Items || []).filter((i) => i.entityType === 'BATCH'));
  return { statusCode: 200, body: JSON.stringify({ batches }) };
};
