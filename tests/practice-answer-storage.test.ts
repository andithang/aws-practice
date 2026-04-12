import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../frontend/lib/api', () => ({
  apiUrl: (path: string) => `http://localhost${path}`
}));

class FakeRequest<T> {
  result!: T;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
}

class FakeObjectStore {
  constructor(private readonly records: Map<string, unknown>) {}

  get(key: string): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>();
    queueMicrotask(() => {
      request.result = this.records.get(key);
      request.onsuccess?.();
    });
    return request;
  }

  put(value: unknown, key: string): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>();
    queueMicrotask(() => {
      this.records.set(key, value);
      request.result = key;
      request.onsuccess?.();
    });
    return request;
  }

  delete(key: string): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>();
    queueMicrotask(() => {
      this.records.delete(key);
      request.result = undefined;
      request.onsuccess?.();
    });
    return request;
  }
}

class FakeTransaction {
  error: Error | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor(private readonly stores: Map<string, Map<string, unknown>>) {}

  objectStore(name: string): FakeObjectStore {
    const store = this.stores.get(name);
    if (!store) {
      throw new Error(`Object store does not exist: ${name}`);
    }
    return new FakeObjectStore(store);
  }
}

class FakeObjectStoreNames {
  constructor(private readonly stores: Map<string, Map<string, unknown>>) {}

  contains(name: string): boolean {
    return this.stores.has(name);
  }
}

class FakeDatabase {
  public readonly objectStoreNames: FakeObjectStoreNames;

  constructor(private readonly stores: Map<string, Map<string, unknown>>) {
    this.objectStoreNames = new FakeObjectStoreNames(stores);
  }

  createObjectStore(name: string): FakeObjectStore {
    if (!this.stores.has(name)) {
      this.stores.set(name, new Map<string, unknown>());
    }
    return new FakeObjectStore(this.stores.get(name)!);
  }

  transaction(name: string): FakeTransaction {
    if (!this.stores.has(name)) {
      throw new Error(`Object store does not exist: ${name}`);
    }
    return new FakeTransaction(this.stores);
  }
}

type OpenedDb = {
  version: number;
  stores: Map<string, Map<string, unknown>>;
};

class FakeIndexedDb {
  private readonly dbByName = new Map<string, OpenedDb>();

  open(name: string, version?: number): FakeRequest<FakeDatabase> {
    const request = new FakeRequest<FakeDatabase>();

    queueMicrotask(() => {
      const existing = this.dbByName.get(name) || {
        version: 0,
        stores: new Map<string, Map<string, unknown>>()
      };

      const targetVersion = version ?? Math.max(1, existing.version);
      const upgraded = targetVersion > existing.version;
      existing.version = targetVersion;
      this.dbByName.set(name, existing);

      request.result = new FakeDatabase(existing.stores);
      if (upgraded) {
        request.onupgradeneeded?.();
      }
      request.onsuccess?.();
    });

    return request;
  }
}

describe('device-session practice answers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('indexedDB', new FakeIndexedDb());
  });

  it('stores practice answers in the same IndexedDB used for device sessions', async () => {
    const module = await import('../frontend/lib/device-session');

    await module.saveDeviceSession({
      seed: 'seed',
      deviceId: 'device-id',
      expiresAt: '2099-01-01T00:00:00.000Z',
      expiresAtEpochSeconds: 4102444800
    });

    await module.savePracticeAnswer({
      questionKey: 'q-1',
      selectedAnswers: ['A', 'C']
    });

    const savedSession = await module.loadDeviceSession();
    const savedAnswers = await module.loadPracticeAnswers(['q-1', 'q-2']);

    expect(savedSession?.deviceId).toBe('device-id');
    expect(savedAnswers).toEqual({ 'q-1': ['A', 'C'] });
  });

  it('clears a question answer when requested', async () => {
    const module = await import('../frontend/lib/device-session');

    await module.savePracticeAnswer({
      questionKey: 'q-2',
      selectedAnswers: ['B']
    });

    await module.clearPracticeAnswer('q-2');

    expect(await module.loadPracticeAnswers(['q-2'])).toEqual({});
  });
});
