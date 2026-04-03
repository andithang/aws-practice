import { APIGatewayProxyHandler } from 'aws-lambda';
import { verifyAdminToken } from '../common/auth';
import { queryByPk } from '../common/aws';
import { json } from '../common/http';

const levels = ['practitioner', 'associate', 'professional'];

export const handler: APIGatewayProxyHandler = async (event) => {
  if (!(await verifyAdminToken(event))) return json(401, { message: 'Unauthorized' });

  const all = await Promise.all(levels.map((l) => queryByPk(`LEVEL#${l}`)));
  const batches = all.flatMap((r) => (r.Items || []).filter((i) => i.entityType === 'BATCH'));
  return json(200, { batches });
};
