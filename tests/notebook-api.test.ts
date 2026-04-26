import { describe, expect, it, vi } from 'vitest';

vi.mock('../frontend/lib/api-client', () => ({
  apiRequest: vi.fn()
}));

import { apiRequest } from '../frontend/lib/api-client';
import {
  createNotebookNote,
  deleteNotebookNote,
  listNotebookNotes,
  updateNotebookNote
} from '../frontend/lib/notebook-api';

describe('notebook api client', () => {
  it('lists notes with tags and keyword query', async () => {
    vi.mocked(apiRequest).mockResolvedValue(
      new Response(
        JSON.stringify({
          count: 1,
          notes: [{ noteId: 'n1', email: 'u@example.com', note: 'abc', tags: ['Amazon S3'], createdAt: '', updatedAt: '' }],
          pagination: {
            requestedPage: 1,
            effectivePage: 1,
            size: 10,
            windowSize: 100,
            requestedWindow: 0,
            effectiveWindow: 0,
            currentPageIndex: 1,
            didWindowRollover: false,
            hasNextWindow: false,
            hasPrevWindow: false,
            totalFiltered: 1,
            totalInWindow: 1,
            totalPagesInWindow: 1
          }
        }),
        { status: 200 }
      )
    );

    const result = await listNotebookNotes({
      page: 1,
      window: 0,
      tags: ['Amazon S3', 'AWS Lambda'],
      keyword: 'lambda'
    });

    expect(result.notes).toHaveLength(1);
    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith(
      '/api/notebook/notes?page=1&window=0&tags=Amazon+S3%2CAWS+Lambda&keyword=lambda'
    );
  });

  it('creates note via POST', async () => {
    vi.mocked(apiRequest).mockResolvedValue(
      new Response(
        JSON.stringify({
          note: {
            noteId: 'n1',
            email: 'u@example.com',
            note: 'abc',
            tags: ['Amazon S3'],
            createdAt: '',
            updatedAt: ''
          }
        }),
        { status: 200 }
      )
    );

    await createNotebookNote({ note: 'abc', tags: ['Amazon S3'] });

    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith('/api/notebook/notes', {
      method: 'POST',
      body: JSON.stringify({ note: 'abc', tags: ['Amazon S3'] })
    });
  });

  it('updates note via PUT', async () => {
    vi.mocked(apiRequest).mockResolvedValue(
      new Response(
        JSON.stringify({
          note: {
            noteId: 'n1',
            email: 'u@example.com',
            note: 'abc',
            tags: ['Amazon S3'],
            createdAt: '',
            updatedAt: ''
          }
        }),
        { status: 200 }
      )
    );

    await updateNotebookNote('n1', { note: 'abc', tags: ['Amazon S3'] });

    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith('/api/notebook/notes/n1', {
      method: 'PUT',
      body: JSON.stringify({ note: 'abc', tags: ['Amazon S3'] })
    });
  });

  it('deletes note via DELETE', async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await deleteNotebookNote('n1');

    expect(vi.mocked(apiRequest)).toHaveBeenCalledWith('/api/notebook/notes/n1', {
      method: 'DELETE'
    });
  });
});
