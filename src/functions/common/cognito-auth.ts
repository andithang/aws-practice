import { APIGatewayProxyEvent } from 'aws-lambda';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as Record<string, unknown>;
}

export function getUserSubFromEvent(event: APIGatewayProxyEvent): string {
  const authorizer = asRecord(event.requestContext?.authorizer);
  const claims = asRecord(authorizer?.claims);
  const sub = claims?.sub;
  return typeof sub === 'string' ? sub.trim() : '';
}
