import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/functions/common/device', () => ({
  validateDeviceForEvent: vi.fn(),
  enrichDeviceIdentityForEvent: vi.fn()
}));

vi.mock('../src/functions/common/notebook-note-store', () => ({
  listNotebookNotesByUser: vi.fn(),
  listNotebookTagLinksByUserTag: vi.fn(),
  batchGetNotebookNotesByIds: vi.fn(),
  putNotebookNote: vi.fn(),
  putNotebookTagLinks: vi.fn(),
  getNotebookNoteById: vi.fn(),
  deleteNotebookNoteById: vi.fn(),
  deleteNotebookTagLinks: vi.fn()
}));

import { handler } from '../src/functions/notebook-notes/handler';
import { enrichDeviceIdentityForEvent, validateDeviceForEvent } from '../src/functions/common/device';
import {
  batchGetNotebookNotesByIds,
  deleteNotebookNoteById,
  deleteNotebookTagLinks,
  getNotebookNoteById,
  listNotebookNotesByUser,
  listNotebookTagLinksByUserTag,
  putNotebookNote,
  putNotebookTagLinks
} from '../src/functions/common/notebook-note-store';

function buildEvent(input: {
  method?: string;
  path?: string;
  pathParameters?: Record<string, string> | null;
  query?: Record<string, string>;
  body?: unknown;
  claims?: Record<string, string>;
} = {}): Parameters<typeof handler>[0] {
  return {
    headers: {
      'X-Device-Id': 'device-1'
    },
    httpMethod: input.method || 'GET',
    path: input.path || '/api/notebook/notes',
    body: input.body === undefined ? null : JSON.stringify(input.body),
    pathParameters: input.pathParameters || null,
    queryStringParameters: input.query || null,
    requestContext: {
      requestId: 'req-notebook-1',
      authorizer: {
        claims: input.claims || { email: 'user@example.com' }
      }
    }
  } as never;
}

describe('notebook-notes handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateDeviceForEvent).mockResolvedValue({ ok: true, deviceId: 'device-1' });
    vi.mocked(enrichDeviceIdentityForEvent).mockResolvedValue();
    vi.mocked(listNotebookNotesByUser).mockResolvedValue([]);
    vi.mocked(listNotebookTagLinksByUserTag).mockResolvedValue([]);
    vi.mocked(batchGetNotebookNotesByIds).mockResolvedValue([]);
    vi.mocked(getNotebookNoteById).mockResolvedValue(null);
    vi.mocked(putNotebookNote).mockResolvedValue();
    vi.mocked(putNotebookTagLinks).mockResolvedValue();
    vi.mocked(deleteNotebookNoteById).mockResolvedValue();
    vi.mocked(deleteNotebookTagLinks).mockResolvedValue();
  });

  it('returns 428 when device validation fails', async () => {
    vi.mocked(validateDeviceForEvent).mockResolvedValue({ ok: false, statusCode: 428, message: 'Device id expired' });

    const response = await handler(buildEvent());

    expect(response.statusCode).toBe(428);
    expect(vi.mocked(enrichDeviceIdentityForEvent)).not.toHaveBeenCalled();
  });

  it('returns 401 when email claim is missing', async () => {
    const response = await handler(buildEvent({ claims: {} }));

    expect(response.statusCode).toBe(401);
    expect(vi.mocked(enrichDeviceIdentityForEvent)).not.toHaveBeenCalled();
  });

  it('returns currentPageIndex for first page', async () => {
    vi.mocked(listNotebookNotesByUser).mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        noteId: `note-${index + 1}`,
        email: 'user@example.com',
        note: `note ${index + 1}`,
        tags: ['Amazon S3'],
        createdAt: `2026-04-01T00:00:${String(index).padStart(2, '0')}.000Z`,
        updatedAt: `2026-04-01T00:00:${String(index).padStart(2, '0')}.000Z`
      }))
    );

    const response = await handler(buildEvent({ query: { page: '1', window: '0' } }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.pagination.currentPageIndex).toBe(1);
    expect(body.notes).toHaveLength(10);
  });

  it('returns window rollover metadata when page exceeds pagesPerWindow', async () => {
    vi.mocked(listNotebookNotesByUser).mockResolvedValue(
      Array.from({ length: 120 }, (_, index) => ({
        noteId: `note-${index + 1}`,
        email: 'user@example.com',
        note: `note ${index + 1}`,
        tags: ['Amazon S3'],
        createdAt: `2026-04-01T00:00:${String(index).padStart(2, '0')}.000Z`,
        updatedAt: `2026-04-01T00:00:${String(index).padStart(2, '0')}.000Z`
      }))
    );

    const response = await handler(buildEvent({ query: { page: '11', window: '0' } }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.pagination.effectiveWindow).toBe(1);
    expect(body.pagination.effectivePage).toBe(1);
    expect(body.pagination.currentPageIndex).toBe(11);
  });

  it('filters by tags(any) and keyword(and)', async () => {
    vi.mocked(listNotebookTagLinksByUserTag)
      .mockResolvedValueOnce([
        { noteId: 'note-1', tag: 'Amazon S3', updatedAt: '2026-04-01T00:00:00.000Z' }
      ])
      .mockResolvedValueOnce([
        { noteId: 'note-2', tag: 'AWS Lambda', updatedAt: '2026-04-02T00:00:00.000Z' }
      ]);

    vi.mocked(batchGetNotebookNotesByIds).mockResolvedValue([
      {
        noteId: 'note-1',
        email: 'user@example.com',
        note: 'S3 study memo',
        tags: ['Amazon S3'],
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z'
      },
      {
        noteId: 'note-2',
        email: 'user@example.com',
        note: 'Lambda cold starts',
        tags: ['AWS Lambda'],
        createdAt: '2026-04-02T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z'
      }
    ]);

    const response = await handler(
      buildEvent({
        query: {
          tags: 'Amazon S3,AWS Lambda',
          keyword: 'lambda',
          page: '1',
          window: '0'
        }
      })
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].noteId).toBe('note-2');
    expect(vi.mocked(listNotebookTagLinksByUserTag)).toHaveBeenCalledTimes(2);
  });

  it('creates note with validated tags', async () => {
    const response = await handler(
      buildEvent({
        method: 'POST',
        body: {
          note: 'Review VPC routing',
          tags: ['Amazon VPC', 'AWS Lambda']
        }
      })
    );

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(putNotebookNote)).toHaveBeenCalled();
    expect(vi.mocked(putNotebookTagLinks)).toHaveBeenCalled();
  });

  it('returns 400 for note exceeding max length', async () => {
    const response = await handler(
      buildEvent({
        method: 'POST',
        body: {
          note: 'x'.repeat(4001),
          tags: ['Amazon VPC']
        }
      })
    );

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for unknown tag', async () => {
    const response = await handler(
      buildEvent({
        method: 'POST',
        body: {
          note: 'Review',
          tags: ['Unknown Service']
        }
      })
    );

    expect(response.statusCode).toBe(400);
  });

  it('updates and rebuilds tag links', async () => {
    vi.mocked(getNotebookNoteById).mockResolvedValue({
      noteId: 'note-1',
      email: 'user@example.com',
      note: 'old',
      tags: ['Amazon S3'],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z'
    });

    const response = await handler(
      buildEvent({
        method: 'PUT',
        path: '/api/notebook/notes/note-1',
        pathParameters: { noteId: 'note-1' },
        body: {
          note: 'new content',
          tags: ['AWS Lambda']
        }
      })
    );

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(putNotebookNote)).toHaveBeenCalled();
    expect(vi.mocked(deleteNotebookTagLinks)).toHaveBeenCalled();
    expect(vi.mocked(putNotebookTagLinks)).toHaveBeenCalled();
  });

  it('returns 404 when updating missing note', async () => {
    const response = await handler(
      buildEvent({
        method: 'PUT',
        path: '/api/notebook/notes/note-404',
        pathParameters: { noteId: 'note-404' },
        body: {
          note: 'new content',
          tags: ['AWS Lambda']
        }
      })
    );

    expect(response.statusCode).toBe(404);
  });

  it('deletes note and tag links', async () => {
    vi.mocked(getNotebookNoteById).mockResolvedValue({
      noteId: 'note-1',
      email: 'user@example.com',
      note: 'old',
      tags: ['Amazon S3'],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z'
    });

    const response = await handler(
      buildEvent({
        method: 'DELETE',
        path: '/api/notebook/notes/note-1',
        pathParameters: { noteId: 'note-1' }
      })
    );

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(deleteNotebookNoteById)).toHaveBeenCalledWith('user@example.com', 'note-1');
    expect(vi.mocked(deleteNotebookTagLinks)).toHaveBeenCalled();
  });
});
