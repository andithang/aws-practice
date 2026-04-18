import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../frontend/lib/device-session', () => ({
  getOrRefreshDeviceSession: vi.fn(),
  refreshDeviceSession: vi.fn()
}));

vi.mock('../frontend/lib/api', () => ({
  apiUrl: (path: string) => `http://localhost${path}`
}));

import { apiRequest } from '../frontend/lib/api-client';
import { getOrRefreshDeviceSession } from '../frontend/lib/device-session';

describe('api client form-data behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not force JSON content-type when body is FormData', async () => {
    vi.mocked(getOrRefreshDeviceSession).mockResolvedValue({
      seed: 'seed',
      deviceId: 'device-id',
      expiresAt: '2026-04-11T00:00:00.000Z'
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const form = new FormData();
    form.append('file', new Blob(['a,b\n1,2'], { type: 'text/csv' }), 'questions.csv');

    await apiRequest('/api/admin/questions/import', {
      method: 'POST',
      body: form
    });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('X-Device-Id')).toBe('device-id');
    expect(headers.get('Content-Type')).toBeNull();
  });
});
