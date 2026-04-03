import { APIGatewayProxyHandler } from 'aws-lambda';
import { verifyAdminToken } from '../common/auth';
import { updateStatus } from '../common/aws';
import { json } from '../common/http';

export const handler: APIGatewayProxyHandler = async (event) => {
  if (!(await verifyAdminToken(event))) return json(401, { message: 'Unauthorized' });
  const batchId = event.pathParameters?.batchId;
  const body = JSON.parse(event.body || '{}');
  const level = body.level;
  const date = body.date;
  const pk = `LEVEL#${level}`;
  const sk = `DATE#${date}#BATCH#${batchId}`;
  await updateStatus(pk, sk, 'deprecated');
  return json(200, { ok: true });
};
