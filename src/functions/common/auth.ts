import { APIGatewayProxyEvent } from 'aws-lambda';
import { getSecretJson } from './aws';

export async function verifyAdminToken(event: APIGatewayProxyEvent): Promise<boolean> {
  const auth = event.headers.authorization || event.headers.Authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.replace('Bearer ', '').trim();
  const secret = await getSecretJson(process.env.ADMIN_TOKEN_SECRET_ID!);
  return token === secret.token;
}
