import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/functions/common/device-store', () => ({
  putDeviceItem: vi.fn(),
  getDeviceItem: vi.fn()
}));

import { enrichDeviceIdentityForEvent, issueDeviceSeed, validateDeviceForEvent } from '../src/functions/common/device';
import { getDeviceItem, putDeviceItem } from '../src/functions/common/device-store';

describe('device persistence boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('does not write enrichment metadata when Cognito email is missing', async () => {
    vi.mocked(getDeviceItem).mockResolvedValue({
      PK: 'DEVICE#device-id',
      SK: 'METADATA',
      entityType: 'DEVICE',
      deviceId: 'device-id'
    });

    await enrichDeviceIdentityForEvent({
      headers: { 'X-Device-Id': 'device-id', Authorization: 'Bearer admin-token' },
      requestContext: {}
    } as never, 'device-id');

    expect(vi.mocked(putDeviceItem)).not.toHaveBeenCalled();
  });

  it('writes enrichment metadata when email or userAgent changes', async () => {
    vi.mocked(getDeviceItem).mockResolvedValue({
      PK: 'DEVICE#device-id',
      SK: 'METADATA',
      entityType: 'DEVICE',
      deviceId: 'device-id',
      email: 'old@example.com',
      userAgent: 'old-agent',
      updatedAt: '2026-04-09T00:00:00.000Z'
    });

    const payload = Buffer.from(JSON.stringify({ email: 'new@example.com' }), 'utf8').toString('base64url');
    const event = {
      headers: {
        'X-Device-Id': 'device-id',
        Authorization: `Bearer header.${payload}.signature`,
        'User-Agent': 'new-agent'
      },
      requestContext: {}
    } as never;
    await enrichDeviceIdentityForEvent(event, 'device-id', new Date('2026-04-10T00:00:00.000Z'));

    expect(vi.mocked(putDeviceItem)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(putDeviceItem).mock.calls[0]?.[0]).toMatchObject({
      PK: 'DEVICE#device-id',
      SK: 'METADATA',
      email: 'new@example.com',
      userAgent: 'new-agent',
      updatedAt: '2026-04-10T00:00:00.000Z'
    });
  });

  it('does not write enrichment metadata when values are unchanged', async () => {
    vi.mocked(getDeviceItem).mockResolvedValue({
      PK: 'DEVICE#device-id',
      SK: 'METADATA',
      entityType: 'DEVICE',
      deviceId: 'device-id',
      email: 'same@example.com',
      userAgent: 'same-agent',
      updatedAt: '2026-04-09T00:00:00.000Z'
    });

    const payload = Buffer.from(JSON.stringify({ email: 'same@example.com' }), 'utf8').toString('base64url');
    const event = {
      headers: {
        'X-Device-Id': 'device-id',
        Authorization: `Bearer header.${payload}.signature`,
        'User-Agent': 'same-agent'
      },
      requestContext: {}
    } as never;

    await enrichDeviceIdentityForEvent(event, 'device-id', new Date('2026-04-10T00:00:00.000Z'));

    expect(vi.mocked(putDeviceItem)).not.toHaveBeenCalled();
  });
});
