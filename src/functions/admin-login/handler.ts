import { APIGatewayProxyHandler } from 'aws-lambda';
import { getSecretJson } from '../common/aws';
import { json } from '../common/http';

export const handler: APIGatewayProxyHandler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const secret = await getSecretJson(process.env.ADMIN_TOKEN_SECRET_ID!);
  const ok = body.token && body.token === secret.token;
  return json(ok ? 200 : 401, { ok });
};
