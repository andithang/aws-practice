import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/functions/common/device-store', () => ({
  putDeviceItem: vi.fn(),
  getDeviceItem: vi.fn()
}));

import { issueDeviceSeed, validateDeviceForEvent } from '../src/functions/common/device';
import { getDeviceItem, putDeviceItem } from '../src/functions/common/device-store';

describe('device persistence boundary', () => {
  it('writes issued device sessions to the device store', async () => {
    await issueDeviceSeed(new Date('2026-04-09T00:00:00.000Z'));

    expect(vi.mocked(putDeviceItem)).toHaveBeenCalledTimes(1);
    const firstCall = vi.mocked(putDeviceItem).mock.calls[0];
    expect(firstCall[0]).toMatchObject({ entityType: 'DEVICE' });
  });

  it('reads device records from the device store during validation', async () => {
    vi.mocked(getDeviceItem).mockResolvedValue({
      PK: 'DEVICE#device-id',
      SK: 'METADATA',
      entityType: 'DEVICE',
      deviceId: 'device-id',
      expiresAt: '2099-01-01T00:00:00.000Z'
    });

    const result = await validateDeviceForEvent({
      headers: { 'X-Device-Id': 'device-id' },
      requestContext: { requestId: 'req' }
    } as never);

    expect(result).toEqual({ ok: true, deviceId: 'device-id' });
    expect(vi.mocked(getDeviceItem)).toHaveBeenCalledWith({ PK: 'DEVICE#device-id', SK: 'METADATA' });
  });
});
