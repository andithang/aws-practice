import { describe, expect, it } from 'vitest';

import { buildVerifyRequiredRoute, isUnverifiedUserError, mustShowVerificationRequired } from '../frontend/lib/auth-gate';
import { CognitoAuthError } from '../frontend/lib/cognito-auth';

describe('auth gate helpers', () => {
  it('detects Cognito unverified-user errors', () => {
    expect(isUnverifiedUserError(new CognitoAuthError('UserNotConfirmedException', 'not verified'))).toBe(true);
    expect(isUnverifiedUserError(new CognitoAuthError('NotAuthorizedException', 'bad credentials'))).toBe(false);
    expect(isUnverifiedUserError(new Error('random error'))).toBe(false);
  });

  it('builds verify route with required marker', () => {
    expect(buildVerifyRequiredRoute('user@example.com')).toEqual({
      pathname: '/verify',
      query: { email: 'user@example.com', required: '1' }
    });
  });

  it('shows required message only when query marker is 1', () => {
    expect(mustShowVerificationRequired('1')).toBe(true);
    expect(mustShowVerificationRequired('0')).toBe(false);
    expect(mustShowVerificationRequired(undefined)).toBe(false);
    expect(mustShowVerificationRequired(['1'])).toBe(false);
  });
});
