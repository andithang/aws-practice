import { APIGatewayProxyResult } from 'aws-lambda';
import { generateAndPersistBatch } from '../common/generation';

export const handler = async (): Promise<APIGatewayProxyResult> => {
  const result = await generateAndPersistBatch();
  return { statusCode: 200, body: JSON.stringify({ ok: true, ...result }) };
};
