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

function decodeClaimsFromBearerToken(authorization: string): Record<string, unknown> | undefined {
  if (!authorization) return undefined;
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return undefined;

  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return undefined;

  try {
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const normalizedPayload = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, '=');
    const parsed = JSON.parse(Buffer.from(normalizedPayload, 'base64').toString('utf8')) as unknown;
    return asRecord(parsed);
  } catch {
    return undefined;
  }
}

export function getUserSubFromEvent(event: APIGatewayProxyEvent): string {
  const authorizer = asRecord(event.requestContext?.authorizer);
  const claims =
    asRecord(authorizer?.claims) ??
    asRecord(asRecord(authorizer?.jwt)?.claims);
  const sub = claims?.sub;
  if (typeof sub === 'string' && sub.trim()) return sub.trim();

  const tokenClaims = decodeClaimsFromBearerToken(getAuthorizationHeader(event));
  const tokenSub = tokenClaims?.sub;
  return typeof tokenSub === 'string' ? tokenSub.trim() : '';
}

export function getUserEmailFromEvent(event: APIGatewayProxyEvent): string {
  const authorizer = asRecord(event.requestContext?.authorizer);
  const claims =
    asRecord(authorizer?.claims) ??
    asRecord(asRecord(authorizer?.jwt)?.claims);
  const email = claims?.email;
  if (typeof email === 'string' && email.trim()) return email.trim().toLowerCase();

  const tokenClaims = decodeClaimsFromBearerToken(getAuthorizationHeader(event));
  const tokenEmail = tokenClaims?.email;
  if (typeof tokenEmail !== 'string') return '';
  return tokenEmail.trim().toLowerCase();
}
