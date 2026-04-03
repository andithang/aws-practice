import { APIGatewayProxyResult } from 'aws-lambda';

const corsOrigin = process.env.CORS_ALLOW_ORIGIN || 'https://aws-practice.andithang.org';

export function json(statusCode: number, payload: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Api-Key,x-api-key',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    },
    body: JSON.stringify(payload)
  };
}
