import { apiUrl } from './api';

export type DeviceSession = {
  seed: string;
  deviceId: string;
  expiresAt: string;
  expiresAtEpochSeconds: number;
};

type DeviceSeedResponse = {
  seed?: string;
  deviceId?: string;
  expiresAt?: string;
};

const dbName = 'aws-practice-device';
const dbVersion = 2;
const deviceStoreName = 'device-session';
const deviceStoreKey = 'current';
const deviceSeedByteLength = 64;
const refreshWindowMs = 3 * 24 * 60 * 60 * 1000;

let refreshPromise: Promise<DeviceSession> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    throw new Error('IndexedDB is unavailable in this environment');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(deviceStoreName)) {
        db.createObjectStore(deviceStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open device database'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    transaction.onerror = () => reject(transaction.error || new Error('Device store transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Device store transaction aborted'));

    Promise.resolve(task(store))
      .then((value) => resolve(value))
      .catch((error) => reject(error));
  });
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.trim();
  if (!normalized) return new Uint8Array();

  const padded = normalized.replace(/-/g, '+').replace(/_/g, '/');
  const target = padded.padEnd(Math.ceil(padded.length / 4) * 4, '=');
  const binary = globalThis.atob(target);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return globalThis
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  return new Uint8Array(digest);
}

function normalizeExpiresAt(expiresAt: string | undefined): string {
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) {
    return new Date(Date.now() + refreshWindowMs).toISOString();
  }

  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) {
    throw new Error('Device expiry timestamp is invalid');
  }

  return new Date(parsed).toISOString();
}

async function buildSession(seed: string, expiresAt?: string): Promise<DeviceSession> {
  const rawSeed = base64UrlToBytes(seed);
  if (rawSeed.length < deviceSeedByteLength) {
    throw new Error(`Device seed must be at least ${deviceSeedByteLength} bytes`);
  }

  const digest = await sha256(rawSeed);
  const normalizedExpiresAt = normalizeExpiresAt(expiresAt);
  return {
    seed,
    deviceId: bytesToBase64Url(digest),
    expiresAt: normalizedExpiresAt,
    expiresAtEpochSeconds: Math.floor(Date.parse(normalizedExpiresAt) / 1000)
  };
}

function isExpired(session: DeviceSession): boolean {
  return session.expiresAtEpochSeconds <= Math.floor(Date.now() / 1000);
}

function isSessionLike(value: unknown): value is DeviceSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeviceSession>;
  return (
    typeof candidate.seed === 'string' &&
    typeof candidate.deviceId === 'string' &&
    typeof candidate.expiresAt === 'string' &&
    typeof candidate.expiresAtEpochSeconds === 'number'
  );
}

export async function loadDeviceSession(): Promise<DeviceSession | null> {
  if (!hasIndexedDb()) return null;

  const stored = await withStore(deviceStoreName, 'readonly', (store) => {
    const request = store.get(deviceStoreKey);
    return new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to read device session'));
    });
  });

  if (!isSessionLike(stored)) return null;
  if (isExpired(stored)) return null;
  return stored;
}

export async function saveDeviceSession(session: DeviceSession): Promise<void> {
  if (!hasIndexedDb()) return;

  await withStore(deviceStoreName, 'readwrite', async (store) => {
    await new Promise<void>((resolve, reject) => {
      const request = store.put(session, deviceStoreKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to save device session'));
    });
  });
}

export async function clearDeviceSession(): Promise<void> {
  if (!hasIndexedDb()) return;

  await withStore(deviceStoreName, 'readwrite', async (store) => {
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(deviceStoreKey);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to clear device session'));
    });
  });
}

export async function fetchDeviceSession(): Promise<DeviceSession> {
  const response = await fetch(apiUrl('/api/device/seed'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to bootstrap device (${response.status})`);
  }

  const payload = (await response.json()) as DeviceSeedResponse;
  const seed = typeof payload.seed === 'string' ? payload.seed.trim() : '';
  if (!seed) {
    throw new Error('Device seed response is missing seed');
  }

  const session = await buildSession(seed, payload.expiresAt);
  if (payload.deviceId && payload.deviceId !== session.deviceId) {
    throw new Error('Device seed response is inconsistent');
  }

  await saveDeviceSession(session);
  return session;
}

export async function refreshDeviceSession(): Promise<DeviceSession> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    await clearDeviceSession();
    return fetchDeviceSession();
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function getOrRefreshDeviceSession(forceRefresh = false): Promise<DeviceSession> {
  if (!forceRefresh) {
    const stored = await loadDeviceSession();
    if (stored) {
      return stored;
    }
  }

  return refreshDeviceSession();
}
