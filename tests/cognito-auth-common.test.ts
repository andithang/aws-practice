import { describe, expect, it } from 'vitest';

import { getUserEmailFromEvent, getUserSubFromEvent } from '../src/functions/common/cognito-auth';

function buildEvent(authorizer: unknown): Parameters<typeof getUserSubFromEvent>[0] {
  return {
    headers: {},
    requestContext: {
      authorizer
    }
  } as never;
}

describe('getUserSubFromEvent', () => {
  it('reads sub from REST API authorizer.claims', () => {
    const sub = getUserSubFromEvent(
      buildEvent({
        claims: {
          sub: ' user-sub-rest '
        }
      })
    );

    expect(sub).toBe('user-sub-rest');
  });

  it('reads sub from HTTP API authorizer.jwt.claims', () => {
    const sub = getUserSubFromEvent(
      buildEvent({
        jwt: {
          claims: {
            sub: 'user-sub-jwt'
          }
        }
      })
    );

    expect(sub).toBe('user-sub-jwt');
  });

  it('returns empty string when sub is unavailable', () => {
    const sub = getUserSubFromEvent(buildEvent({ claims: {} }));

    expect(sub).toBe('');
  });

  it('reads sub from authorization bearer token payload when authorizer is missing', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'user-sub-from-token' }), 'utf8').toString('base64url');
    const token = `header.${payload}.signature`;
    const sub = getUserSubFromEvent({
      headers: {
        authorization: `Bearer ${token}`
      },
      requestContext: {}
    } as never);

    expect(sub).toBe('user-sub-from-token');
  });
});

describe('getUserEmailFromEvent', () => {
  it('reads email from REST API authorizer.claims', () => {
    const email = getUserEmailFromEvent(
      buildEvent({
        claims: {
          email: ' USER@Example.com '
        }
      })
    );

    expect(email).toBe('user@example.com');
  });

  it('reads email from HTTP API authorizer.jwt.claims', () => {
    const email = getUserEmailFromEvent(
      buildEvent({
        jwt: {
          claims: {
            email: 'user-jwt@example.com'
          }
        }
      })
    );

    expect(email).toBe('user-jwt@example.com');
  });

  it('reads email from authorization bearer token payload when authorizer is missing', () => {
    const payload = Buffer.from(JSON.stringify({ email: 'payload@example.com' }), 'utf8').toString('base64url');
    const token = `header.${payload}.signature`;
    const email = getUserEmailFromEvent({
      headers: {
        authorization: `Bearer ${token}`
      },
      requestContext: {}
    } as never);

    expect(email).toBe('payload@example.com');
  });

  it('returns empty string when email is unavailable or malformed', () => {
    expect(getUserEmailFromEvent(buildEvent({ claims: {} }))).toBe('');
    expect(getUserEmailFromEvent({
      headers: {
        authorization: 'Bearer invalid-token'
      },
      requestContext: {}
    } as never)).toBe('');
  });
});
