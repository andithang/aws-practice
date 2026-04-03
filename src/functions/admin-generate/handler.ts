import { APIGatewayProxyHandler } from 'aws-lambda';
import { verifyAdminToken } from '../common/auth';
import { generateAndPersistBatch } from '../common/generation';
import { json } from '../common/http';

export const handler: APIGatewayProxyHandler = async (event) => {
  if (!(await verifyAdminToken(event))) {
    return json(401, { message: 'Unauthorized' });
  }
  const result = await generateAndPersistBatch();
  return json(200, { ok: true, ...result });
};
