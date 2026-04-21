import { APIGatewayProxyEvent } from 'aws-lambda';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as Record<string, unknown>;
}

function getAuthorizationHeader(event: APIGatewayProxyEvent): string {
  const headers = event.headers ?? {};
  const authorization = headers.Authorization ?? headers.authorization;
  return typeof authorization === 'string' ? authorization.trim() : '';
}

function decodeSubFromBearerToken(authorization: string): string {
  if (!authorization) return '';
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return '';

  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return '';

  try {
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalizedPayload = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, '=');
    const parsed = JSON.parse(Buffer.from(normalizedPayload, 'base64').toString('utf8')) as unknown;
    const claims = asRecord(parsed);
    const sub = claims?.sub;
    return typeof sub === 'string' ? sub.trim() : '';
  } catch {
    return '';
  }
}

export function getUserSubFromEvent(event: APIGatewayProxyEvent): string {
  const authorizer = asRecord(event.requestContext?.authorizer);
  const claims =
    asRecord(authorizer?.claims) ??
    asRecord(asRecord(authorizer?.jwt)?.claims);
  const sub = claims?.sub;
  if (typeof sub === 'string' && sub.trim()) return sub.trim();

  return decodeSubFromBearerToken(getAuthorizationHeader(event));
}
