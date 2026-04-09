import { APIGatewayProxyResult } from 'aws-lambda';
// import { logInfo } from './log';

const corsOrigin = process.env.CORS_ALLOW_ORIGIN || 'https://aws-practice.andithang.org';

export function json(
  statusCode: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {}
): APIGatewayProxyResult {
  // logInfo(`process.env.CORS_ALLOW_ORIGIN=${process.env.CORS_ALLOW_ORIGIN}, corsOrigin=${corsOrigin}`);
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,x-api-key,X-Device-Id',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  };
}
