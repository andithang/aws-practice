import { describe, expect, it } from 'vitest';
import { deriveDeviceIdFromSeed, generateDeviceSeed } from '../src/functions/common/device';

describe('device crypto helpers', () => {
  it('generates a 64-byte seed encoded for transport', () => {
    const seed = generateDeviceSeed();
    const raw = Buffer.from(seed, 'base64url');

    expect(seed.length).toBeGreaterThan(0);
    expect(raw.length).toBe(64);
  });

  it('derives the same device id from the same seed', () => {
    const seed = generateDeviceSeed();
    const first = deriveDeviceIdFromSeed(seed);
    const second = deriveDeviceIdFromSeed(seed);

    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a seed that is too short', () => {
    const shortSeed = Buffer.from('short').toString('base64url');
    expect(() => deriveDeviceIdFromSeed(shortSeed)).toThrow(/seed/i);
  });
});
