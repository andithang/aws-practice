import { apiUrl } from './api';
import { clearAdminToken, getAdminToken } from './admin-auth';

export type AdminBatch = {
  batchId: string;
  level: string;
  date: string;
  status: string;
};

export type AdminQuestion = {
  id: string;
  questionId: string;
  batchId: string;
  level: string;
  date: string;
  topic: string;
  stem: string;
  explanation: string;
  examStyle: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminQuestionAction = 'publish' | 'deprecate';

export type AdminQuestionsQuery = {
  page?: number;
  size?: number;
  window?: number;
  level?: string;
  batchIds?: string[];
  createdFrom?: string;
  createdTo?: string;
  keyword?: string;
};

export type AdminQuestionsPagination = {
  requestedPage: number;
  effectivePage: number;
  size: number;
  windowSize: number;
  requestedWindow: number;
  effectiveWindow: number;
  didWindowRollover: boolean;
  hasNextWindow: boolean;
  hasPrevWindow: boolean;
  totalFiltered: number;
  totalInWindow: number;
  totalPagesInWindow: number;
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

export async function listAdminQuestions(
  query: AdminQuestionsQuery
): Promise<{ questions: AdminQuestion[]; pagination: AdminQuestionsPagination }> {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.size) params.set('size', String(query.size));
  if (query.window !== undefined) params.set('window', String(query.window));
  if (query.level) params.set('level', query.level);
  if (query.batchIds && query.batchIds.length > 0) params.set('batchIds', query.batchIds.join(','));
  if (query.createdFrom) params.set('createdFrom', query.createdFrom);
  if (query.createdTo) params.set('createdTo', query.createdTo);
  if (query.keyword) params.set('keyword', query.keyword.trim());

  const response = await adminRequest(
    `/api/admin/questions${params.toString() ? `?${params.toString()}` : ''}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    throw new Error(await readError(response, `Failed to load questions (${response.status})`));
  }

  const payload = (await response.json()) as {
    questions?: AdminQuestion[];
    pagination?: AdminQuestionsPagination;
  };

  return {
    questions: Array.isArray(payload.questions) ? payload.questions : [],
    pagination: payload.pagination || {
      requestedPage: 1,
      effectivePage: 1,
      size: query.size || 20,
      windowSize: 100,
      requestedWindow: 0,
      effectiveWindow: 0,
      didWindowRollover: false,
      hasNextWindow: false,
      hasPrevWindow: false,
      totalFiltered: 0,
      totalInWindow: 0,
      totalPagesInWindow: 0
    }
  };
}

export async function updateAdminQuestionsStatus(
  action: AdminQuestionAction,
  questionIds: string[]
): Promise<void> {
  const response = await adminRequest('/api/admin/questions/status', {
    method: 'POST',
    body: JSON.stringify({ action, questionIds })
  });

  if (!response.ok) {
    throw new Error(await readError(response, `Question update failed (${response.status})`));
  }
}
