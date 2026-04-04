import { apiUrl } from './api';
import { clearAdminToken, getAdminToken } from './admin-auth';

export type AdminBatch = {
  batchId: string;
  level: string;
  date: string;
  status: string;
};

export class AdminUnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'AdminUnauthorizedError';
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (!text) return fallback;

  try {
    const parsed = JSON.parse(text) as { message?: string };
    return parsed.message || fallback;
  } catch {
    return text;
  }
}

async function adminRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAdminToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers
  });

  if (response.status === 401) {
    clearAdminToken();
    throw new AdminUnauthorizedError();
  }

  return response;
}

export async function loginAdmin(token: string): Promise<boolean> {
  const response = await fetch(apiUrl('/api/admin/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token.trim() })
  });

  return response.ok;
}

export async function listAdminBatches(): Promise<AdminBatch[]> {
  const response = await adminRequest('/api/admin/batches', { method: 'GET' });

  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load batches (${response.status})`));
  }

  const payload = (await response.json()) as { batches?: AdminBatch[] };
  return Array.isArray(payload.batches) ? payload.batches : [];
}

export async function generateAdminBatch(): Promise<void> {
  const response = await adminRequest('/api/admin/generate', { method: 'POST' });

  if (!response.ok) {
    throw new Error(await readError(response, `Generation failed (${response.status})`));
  }
}

export async function publishAdminBatch(batch: AdminBatch): Promise<void> {
  const response = await adminRequest(`/api/admin/batches/${batch.batchId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ level: batch.level, date: batch.date })
  });

  if (!response.ok) {
    throw new Error(await readError(response, `Publish failed (${response.status})`));
  }
}

export async function deprecateAdminBatch(batch: AdminBatch): Promise<void> {
  const response = await adminRequest(`/api/admin/batches/${batch.batchId}/deprecate`, {
    method: 'POST',
    body: JSON.stringify({ level: batch.level, date: batch.date })
  });

  if (!response.ok) {
    throw new Error(await readError(response, `Deprecation failed (${response.status})`));
  }
}
