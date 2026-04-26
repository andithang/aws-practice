import { apiRequest } from './api-client';

export type NotebookNote = {
  noteId: string;
  email: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type NotebookPagination = {
  requestedPage: number;
  effectivePage: number;
  currentPageIndex?: number;
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

export type NotebookListResponse = {
  count: number;
  notes: NotebookNote[];
  pagination: NotebookPagination;
};

const defaultPagination: NotebookPagination = {
  requestedPage: 1,
  effectivePage: 1,
  currentPageIndex: 1,
  size: 10,
  windowSize: 100,
  requestedWindow: 0,
  effectiveWindow: 0,
  didWindowRollover: false,
  hasNextWindow: false,
  hasPrevWindow: false,
  totalFiltered: 0,
  totalInWindow: 0,
  totalPagesInWindow: 0
};

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return '';

  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return (parsed.message || parsed.error || '').trim();
  } catch {
    return text.trim();
  }
}

export async function listNotebookNotes(input: {
  page: number;
  window: number;
  tags: string[];
  keyword: string;
}): Promise<NotebookListResponse> {
  const params = new URLSearchParams({
    page: String(input.page),
    window: String(input.window)
  });

  if (input.tags.length > 0) {
    params.set('tags', input.tags.join(','));
  }
  if (input.keyword.trim()) {
    params.set('keyword', input.keyword.trim());
  }

  const response = await apiRequest(`/api/notebook/notes?${params.toString()}`);
  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message || `Failed to load notes (${response.status})`);
  }

  const data = (await response.json()) as Partial<NotebookListResponse>;
  return {
    count: typeof data.count === 'number' ? data.count : 0,
    notes: Array.isArray(data.notes) ? data.notes : [],
    pagination: data.pagination || defaultPagination
  };
}

export async function createNotebookNote(input: { note: string; tags: string[] }): Promise<NotebookNote> {
  const response = await apiRequest('/api/notebook/notes', {
    method: 'POST',
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message || `Failed to create note (${response.status})`);
  }

  const data = (await response.json()) as { note?: NotebookNote };
  if (!data.note) throw new Error('Create note response missing note');
  return data.note;
}

export async function updateNotebookNote(noteId: string, input: { note: string; tags: string[] }): Promise<NotebookNote> {
  const response = await apiRequest(`/api/notebook/notes/${encodeURIComponent(noteId)}`, {
    method: 'PUT',
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message || `Failed to update note (${response.status})`);
  }

  const data = (await response.json()) as { note?: NotebookNote };
  if (!data.note) throw new Error('Update note response missing note');
  return data.note;
}

export async function deleteNotebookNote(noteId: string): Promise<void> {
  const response = await apiRequest(`/api/notebook/notes/${encodeURIComponent(noteId)}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(message || `Failed to delete note (${response.status})`);
  }
}
