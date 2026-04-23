import { beforeEach, describe, expect, it, vi } from 'vitest';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function buildJwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `header.${encoded}.signature`;
}

describe('cognito auth client', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_COGNITO_REGION = 'ap-southeast-1';
    process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID = 'client-id';
    process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID = 'pool-id';

    vi.stubGlobal('window', {
      localStorage: new MemoryStorage()
    });
  });

  it('maps Cognito email quota errors to a user-safe message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ __type: 'LimitExceededException', message: 'Quota exceeded' }), { status: 400 })
      )
    );

    const module = await import('../frontend/lib/cognito-auth');
    await expect(
      module.signUp({
        email: 'user@example.com',
        password: 'Password123',
        name: 'User Name'
      })
    ).rejects.toThrow('Email sending limit reached. Please try again later.');
  });

  it('stores session from sign in and returns token for authenticated API calls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            AuthenticationResult: {
              IdToken: 'id-token',
              AccessToken: 'access-token',
              RefreshToken: 'refresh-token',
              ExpiresIn: 3600
            }
          }),
          { status: 200 }
        )
      )
    );

    const module = await import('../frontend/lib/cognito-auth');
    await module.signIn({ email: 'user@example.com', password: 'Password123' });
    await expect(module.getValidIdToken()).resolves.toBe('id-token');
  });

  it('detects admin users from custom:is_admin claim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            AuthenticationResult: {
              IdToken: buildJwt({ sub: 'user-1', 'custom:is_admin': 'TRUE' }),
              AccessToken: 'access-token',
              RefreshToken: 'refresh-token',
              ExpiresIn: 3600
            }
          }),
          { status: 200 }
        )
      )
    );

    const module = await import('../frontend/lib/cognito-auth');
    await module.signIn({ email: 'admin@example.com', password: 'Password123' });
    await expect(module.isCurrentUserAdmin()).resolves.toBe(true);
  });

  it('treats missing admin claim as non-admin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            AuthenticationResult: {
              IdToken: buildJwt({ sub: 'user-2' }),
              AccessToken: 'access-token',
              RefreshToken: 'refresh-token',
              ExpiresIn: 3600
            }
          }),
          { status: 200 }
        )
      )
    );

    const module = await import('../frontend/lib/cognito-auth');
    await module.signIn({ email: 'user@example.com', password: 'Password123' });
    await expect(module.isCurrentUserAdmin()).resolves.toBe(false);
  });
});
