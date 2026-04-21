import { describe, expect, it } from 'vitest';

import { buildPostResetLoginRoute, mustShowPasswordResetSuccess } from '../frontend/lib/password-reset-gate';

describe('password reset gate helpers', () => {
  it('builds login route with reset marker', () => {
    expect(buildPostResetLoginRoute()).toEqual({
      pathname: '/login',
      query: { reset: '1' }
    });
  });

  it('shows reset success only when marker is 1', () => {
    expect(mustShowPasswordResetSuccess('1')).toBe(true);
    expect(mustShowPasswordResetSuccess('0')).toBe(false);
    expect(mustShowPasswordResetSuccess(undefined)).toBe(false);
    expect(mustShowPasswordResetSuccess(['1'])).toBe(false);
  });
});
