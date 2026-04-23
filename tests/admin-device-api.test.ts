import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../frontend/lib/api-client', () => ({
  apiRequest: vi.fn()
}));

import { apiRequest } from '../frontend/lib/api-client';
import { AdminUnauthorizedError, listAdminDevices, revokeAdminDevice } from '../frontend/lib/admin-api';

describe('admin device api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads admin devices via GET /api/admin/devices', async () => {
    vi.mocked(apiRequest).mockResolvedValue(
      new Response(JSON.stringify([{
        deviceId: 'device-1',
        email: 'user@example.com',
        userAgent: 'Mozilla/5.0',
        expiresAt: '2099-01-01T00:00:00.000Z'
      }]), {
        status: 200
      })
    );

    const devices = await listAdminDevices();

    expect(devices).toEqual([{
      deviceId: 'device-1',
      email: 'user@example.com',
      userAgent: 'Mozilla/5.0',
      expiresAt: '2099-01-01T00:00:00.000Z'
    }]);
    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith('/api/admin/devices', expect.any(Object));
  });

  it('revokes a device via DELETE /api/admin/devices/{deviceId}', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(null, { status: 204 }));

    await revokeAdminDevice('device-1');

    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith('/api/admin/devices/device-1', expect.any(Object));
  });

  it('throws AdminUnauthorizedError on 401', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response('', { status: 401 }));

    await expect(listAdminDevices()).rejects.toBeInstanceOf(AdminUnauthorizedError);
  });
});
