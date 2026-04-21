import { APIGatewayProxyEvent } from 'aws-lambda';
import { createHash, randomBytes } from 'crypto';
import { getUserEmailFromEvent } from './cognito-auth';
import { getDeviceItem, putDeviceItem } from './device-store';

export const deviceSeedByteLength = 64;
export const deviceLifetimeMs = 3 * 24 * 60 * 60 * 1000;
const deviceHeaderName = 'x-device-id';
const deviceRecordSk = 'METADATA';

export type DeviceSession = {
  seed: string;
  deviceId: string;
  expiresAt: string;
  expiresAtEpochSeconds: number;
};

type DeviceRecord = DeviceSession & {
  PK: string;
  SK: string;
  entityType: 'DEVICE';
  createdAt: string;
  updatedAt: string;
  ttl: number;
};

export type DeviceValidationResult =
  | { ok: true; deviceId: string }
  | { ok: false; statusCode: 428; message: string };

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.trim();
  if (!normalized) return new Uint8Array();

  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(normalized, 'base64url'));
  }

  const padded = normalized.replace(/-/g, '+').replace(/_/g, '/');
  const target = padded.padEnd(Math.ceil(padded.length / 4) * 4, '=');
  const binary = globalThis.atob(target);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getDeviceHeader(headers: APIGatewayProxyEvent['headers']): string {
  const value = headers[deviceHeaderName] || headers['X-Device-Id'];
  return typeof value === 'string' ? value.trim() : '';
}

function getUserAgentHeader(headers: APIGatewayProxyEvent['headers']): string {
  const value = headers['user-agent'] || headers['User-Agent'];
  return typeof value === 'string' ? value.trim() : '';
}

function buildDeviceRecord(session: DeviceSession, now = new Date()): DeviceRecord {
  const timestamp = nowIso(now);
  return {
    PK: `DEVICE#${session.deviceId}`,
    SK: deviceRecordSk,
    entityType: 'DEVICE',
    seed: session.seed,
    deviceId: session.deviceId,
    expiresAt: session.expiresAt,
    expiresAtEpochSeconds: session.expiresAtEpochSeconds,
    createdAt: timestamp,
    updatedAt: timestamp,
    ttl: session.expiresAtEpochSeconds
  };
}

export function generateDeviceSeed(): string {
  return randomBytes(deviceSeedByteLength).toString('base64url');
}

export function deriveDeviceIdFromSeed(seed: string): string {
  const raw = base64UrlToBytes(seed);
  if (raw.length < deviceSeedByteLength) {
    throw new Error(`Device seed must be at least ${deviceSeedByteLength} bytes`);
  }

  return createHash('sha256').update(raw).digest('base64url');
}

export function buildDeviceSession(seed: string, expiresAt = new Date(Date.now() + deviceLifetimeMs).toISOString()): DeviceSession {
  const deviceId = deriveDeviceIdFromSeed(seed);
  const parsedExpiresAt = Date.parse(expiresAt);
  if (!Number.isFinite(parsedExpiresAt)) {
    throw new Error('Device expiry timestamp is invalid');
  }

  return {
    seed,
    deviceId,
    expiresAt,
    expiresAtEpochSeconds: Math.floor(parsedExpiresAt / 1000)
  };
}

export async function issueDeviceSeed(now = new Date()): Promise<DeviceSession> {
  const seed = generateDeviceSeed();
  const expiresAt = new Date(now.getTime() + deviceLifetimeMs).toISOString();
  const session = buildDeviceSession(seed, expiresAt);
  await putDeviceItem(buildDeviceRecord(session, now));
  return session;
}

function isExpired(expiresAt: string, now = new Date()): boolean {
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return true;
  return parsed <= now.getTime();
}

export async function validateDeviceForEvent(
  event: APIGatewayProxyEvent,
  now = new Date()
): Promise<DeviceValidationResult> {
  const deviceId = getDeviceHeader(event.headers || {});
  if (!deviceId) {
    return { ok: false, statusCode: 428, message: 'Device id is required' };
  }

  const record = await getDeviceItem({ PK: `DEVICE#${deviceId}`, SK: deviceRecordSk });
  if (!record || record.entityType !== 'DEVICE') {
    return { ok: false, statusCode: 428, message: 'Device id is unknown' };
  }

  const storedExpiresAt = typeof record.expiresAt === 'string' ? record.expiresAt : '';
  if (record.deviceId !== deviceId || isExpired(storedExpiresAt, now)) {
    return { ok: false, statusCode: 428, message: 'Device id expired' };
  }

  return { ok: true, deviceId };
}

export async function enrichDeviceIdentityForEvent(
  event: APIGatewayProxyEvent,
  deviceId: string,
  now = new Date()
): Promise<void> {
  const email = getUserEmailFromEvent(event);
  if (!email) return;

  const record = await getDeviceItem({ PK: `DEVICE#${deviceId}`, SK: deviceRecordSk });
  if (!record || record.entityType !== 'DEVICE') return;

  const storedEmail = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
  const storedUserAgent = typeof record.userAgent === 'string' ? record.userAgent.trim() : '';
  const requestedUserAgent = getUserAgentHeader(event.headers || {});
  const nextUserAgent = requestedUserAgent || storedUserAgent;

  if (storedEmail === email && storedUserAgent === nextUserAgent) {
    return;
  }

  await putDeviceItem({
    ...record,
    email,
    userAgent: nextUserAgent,
    updatedAt: nowIso(now)
  });
}
