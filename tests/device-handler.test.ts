import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/functions/common/device', async () => {
  const actual = await vi.importActual<typeof import('../src/functions/common/device')>(
    '../src/functions/common/device'
  );
  return {
    ...actual,
    issueDeviceSeed: vi.fn(),
    validateDeviceForEvent: vi.fn()
  };
});

vi.mock('../src/functions/common/auth', () => ({
  verifyAdminAccess: vi.fn()
}));

import { handler as deviceSeedHandler } from '../src/functions/device-seed/handler';
import { handler as adminQuestionsHandler } from '../src/functions/admin-questions/handler';
import { issueDeviceSeed, validateDeviceForEvent } from '../src/functions/common/device';
import { verifyAdminAccess } from '../src/functions/common/auth';

describe('device handlers', () => {
  it('returns a seed payload from the device seed endpoint', async () => {
    vi.mocked(issueDeviceSeed).mockResolvedValue({
      seed: 'seed',
      deviceId: 'device',
      expiresAt: '2026-04-11T00:00:00.000Z'
    });

    const response = await deviceSeedHandler({
      headers: {},
      requestContext: { requestId: 'req-1' }
    } as never);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      seed: 'seed',
      deviceId: 'device',
      expiresAt: '2026-04-11T00:00:00.000Z'
    });
  });

  it('rejects admin requests before token verification when the device is invalid', async () => {
    vi.mocked(validateDeviceForEvent).mockResolvedValue({
      ok: false,
      statusCode: 428,
      message: 'Device required'
    });
    const verifyAdminAccessMock = vi.mocked(verifyAdminAccess);
    verifyAdminAccessMock.mockResolvedValue(true);

    const response = await adminQuestionsHandler({
      headers: {},
      requestContext: { requestId: 'req-2' }
    } as never);

    expect(response.statusCode).toBe(428);
    expect(verifyAdminAccessMock).not.toHaveBeenCalled();
  });
});

