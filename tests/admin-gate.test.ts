import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../frontend/lib/cognito-auth', () => ({
  isCurrentUserAdmin: vi.fn(),
  signOut: vi.fn()
}));

import { ensureAdminSession } from '../frontend/lib/admin-gate';
import { isCurrentUserAdmin, signOut } from '../frontend/lib/cognito-auth';

describe('admin gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows access for admin users', async () => {
    vi.mocked(isCurrentUserAdmin).mockResolvedValue(true);

    await expect(ensureAdminSession()).resolves.toBe('allow');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('logs out and redirects for non-admin users', async () => {
    vi.mocked(isCurrentUserAdmin).mockResolvedValue(false);

    await expect(ensureAdminSession()).resolves.toBe('redirect-login');
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
