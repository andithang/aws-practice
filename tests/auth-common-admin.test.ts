import { describe, expect, it } from 'vitest';

import { validateAdminAccess } from '../src/functions/common/auth';

function buildEvent(claims: Record<string, unknown>) {
  return {
    headers: {},
    requestContext: {
      requestId: 'req-1',
      authorizer: { claims }
    }
  } as never;
}

describe('validateAdminAccess', () => {
  it('accepts requests when custom:is_admin is true', async () => {
    await expect(
      validateAdminAccess(
        buildEvent({
          'custom:is_admin': 'true'
        })
      )
    ).resolves.toEqual({ ok: true });
  });

  it('rejects requests when custom:is_admin is missing', async () => {
    await expect(validateAdminAccess(buildEvent({}))).resolves.toEqual({
      ok: false,
      message: 'Admin access required'
    });
  });
});
