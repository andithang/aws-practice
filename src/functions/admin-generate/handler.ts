import { APIGatewayProxyHandler } from 'aws-lambda';
import { verifyAdminToken } from '../common/auth';
import { generateAndPersistBatch } from '../common/generation';

export const handler: APIGatewayProxyHandler = async (event) => {
  if (!(await verifyAdminToken(event))) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
  }
  const result = await generateAndPersistBatch();
  return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) };
};
