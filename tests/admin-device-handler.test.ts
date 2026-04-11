import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('../src/functions/common/auth', () => ({
  validateAdminToken: vi.fn()
}));

vi.mock('../src/functions/common/device-store', () => ({
  listDevices: vi.fn(),
  deleteDeviceItem: vi.fn()
}));

import { handler } from '../src/functions/admin-device/handler';
import { validateAdminToken } from '../src/functions/common/auth';
import { listDevices, deleteDeviceItem } from '../src/functions/common/device-store';

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    headers: {},
    httpMethod: 'GET',
    path: '/api/admin/devices',
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    requestContext: { requestId: 'req-1' },
    ...overrides
  } as never;
}

describe('admin-device handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists devices for GET /api/admin/devices and omits sensitive seed fields', async () => {
    vi.mocked(validateAdminToken).mockResolvedValue({ ok: true });
    vi.mocked(listDevices).mockResolvedValue([
      {
        PK: 'DEVICE#device-1',
        SK: 'METADATA',
        entityType: 'DEVICE',
        seed: 'sensitive-seed',
        deviceId: 'device-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
        expiresAtEpochSeconds: 4070908800,
        createdAt: '2026-04-11T00:00:00.000Z',
        updatedAt: '2026-04-11T00:00:00.000Z',
        ttl: 4070908800
      }
    ]);

    const response = await handler(buildEvent());

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual([
      {
        deviceId: 'device-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
        expiresAtEpochSeconds: 4070908800,
        createdAt: '2026-04-11T00:00:00.000Z',
        updatedAt: '2026-04-11T00:00:00.000Z',
        ttl: 4070908800
      }
    ]);
  });

  it('returns 401 when admin token is invalid', async () => {
    vi.mocked(validateAdminToken).mockResolvedValue({ ok: false, message: 'Invalid admin token' });

    const response = await handler(buildEvent());

    expect(response.statusCode).toBe(401);
    expect(vi.mocked(listDevices)).not.toHaveBeenCalled();
  });

  it('returns 404 for POST /api/admin/devices because manual creation is disabled', async () => {
    vi.mocked(validateAdminToken).mockResolvedValue({ ok: true });

    const response = await handler(
      buildEvent({
        httpMethod: 'POST',
        body: JSON.stringify({})
      })
    );

    expect(response.statusCode).toBe(404);
    expect(vi.mocked(listDevices)).not.toHaveBeenCalled();
    expect(vi.mocked(deleteDeviceItem)).not.toHaveBeenCalled();
  });

  it('returns 404 for DELETE /api/admin/devices because deviceId path param is required', async () => {
    vi.mocked(validateAdminToken).mockResolvedValue({ ok: true });

    const response = await handler(
      buildEvent({
        httpMethod: 'DELETE',
        path: '/api/admin/devices'
      })
    );

    expect(response.statusCode).toBe(404);
    expect(vi.mocked(deleteDeviceItem)).not.toHaveBeenCalled();
  });

  it('revokes a device for DELETE /api/admin/devices/{deviceId}', async () => {
    vi.mocked(validateAdminToken).mockResolvedValue({ ok: true });

    const response = await handler(
      buildEvent({
        httpMethod: 'DELETE',
        path: '/api/admin/devices/device-1',
        pathParameters: { deviceId: 'device-1' }
      })
    );

    expect(response.statusCode).toBe(204);
    expect(vi.mocked(deleteDeviceItem)).toHaveBeenCalledWith({ PK: 'DEVICE#device-1', SK: 'METADATA' });
  });
});
