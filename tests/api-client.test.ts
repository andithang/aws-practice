import { describe, expect, it, vi } from 'vitest';

vi.mock('../frontend/lib/device-session', () => ({
  getOrRefreshDeviceSession: vi.fn(),
  refreshDeviceSession: vi.fn()
}));

vi.mock('../frontend/lib/admin-auth', () => ({
  clearAdminToken: vi.fn(),
  getAdminToken: vi.fn(() => 'admin-token')
}));

vi.mock('../frontend/lib/api', () => ({
  apiUrl: (path: string) => `http://localhost${path}`
}));

import { generateAdminBatch } from '../frontend/lib/admin-api';
import { clearAdminToken } from '../frontend/lib/admin-auth';
import { DeviceBlockedError } from '../frontend/lib/api-client';
import { getOrRefreshDeviceSession, refreshDeviceSession } from '../frontend/lib/device-session';

describe('api client', () => {
  it('retries once after a device rejection and keeps the admin token', async () => {
    vi.mocked(getOrRefreshDeviceSession).mockResolvedValue({
      seed: 'seed',
      deviceId: 'device',
      expiresAt: '2026-04-11T00:00:00.000Z'
    });
    vi.mocked(refreshDeviceSession).mockResolvedValue({
      seed: 'seed-2',
      deviceId: 'device-2',
      expiresAt: '2026-04-11T00:00:00.000Z'
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Device required' }), { status: 428 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await generateAdminBatch();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(clearAdminToken).not.toHaveBeenCalled();
  });

  it('throws DeviceBlockedError when device is revoked', async () => {
    vi.mocked(getOrRefreshDeviceSession).mockResolvedValue({
      seed: 'seed',
      deviceId: 'device',
      expiresAt: '2026-04-11T00:00:00.000Z'
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Device id is unknown' }), { status: 428 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(generateAdminBatch()).rejects.toBeInstanceOf(DeviceBlockedError);
    expect(clearAdminToken).not.toHaveBeenCalled();
  });
});
