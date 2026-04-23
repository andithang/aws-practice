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

function getClaimsFromEvent(event: APIGatewayProxyEvent): Record<string, unknown> | undefined {
  const authorizer = asRecord(event.requestContext?.authorizer);
  const authorizerClaims =
    asRecord(authorizer?.claims) ??
    asRecord(asRecord(authorizer?.jwt)?.claims);

  return authorizerClaims ?? decodeClaimsFromBearerToken(getAuthorizationHeader(event));
}

export function getUserSubFromEvent(event: APIGatewayProxyEvent): string {
  const claims = getClaimsFromEvent(event);
  const sub = claims?.sub;
  if (typeof sub === 'string' && sub.trim()) return sub.trim();
  return '';
}

export function getUserEmailFromEvent(event: APIGatewayProxyEvent): string {
  const claims = getClaimsFromEvent(event);
  const email = claims?.email;
  if (typeof email === 'string' && email.trim()) return email.trim().toLowerCase();
  return '';
}

export function isAdminUserFromEvent(event: APIGatewayProxyEvent): boolean {
  const claims = getClaimsFromEvent(event);
  const isAdmin = claims?.['custom:is_admin'];
  if (typeof isAdmin !== 'string') return false;
  return isAdmin.trim().toLowerCase() === 'true';
}
