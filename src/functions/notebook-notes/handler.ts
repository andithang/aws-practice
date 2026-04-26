import { APIGatewayProxyHandler } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { getUserEmailFromEvent } from '../common/cognito-auth';
import { enrichDeviceIdentityForEvent, validateDeviceForEvent } from '../common/device';
import { json } from '../common/http';
import { errorLogFields, logError, logInfo, logWarn } from '../common/log';
import {
  batchGetNotebookNotesByIds,
  deleteNotebookNoteById,
  deleteNotebookTagLinks,
  getNotebookNoteById,
  listNotebookNotesByUser,
  listNotebookTagLinksByUserTag,
  NotebookNoteRecord,
  putNotebookNote,
  putNotebookTagLinks
} from '../common/notebook-note-store';
import { notebookServiceTagCanonicalMap } from '../common/notebook-service-tags';

const defaultPage = 1;
const pageSize = 10;
const windowSize = 100;
const maxNoteLength = 4000;

type SaveBody = {
  note?: unknown;
  tags?: unknown;
};

function parseBody(body: string | null): SaveBody {
  try {
    return JSON.parse(body || '{}') as SaveBody;
  } catch {
    return {};
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeKeyword(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const uniqueTags = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const normalized = entry.trim().toLowerCase();
    if (!normalized) continue;
    const canonical = notebookServiceTagCanonicalMap.get(normalized);
    if (!canonical) continue;
    uniqueTags.add(canonical);
  }

  return Array.from(uniqueTags);
}

function normalizeTagsFromQuery(value: string | undefined): string[] {
  if (!value) return [];
  return normalizeTags(value.split(','));
}

function hasInvalidTags(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    if (typeof entry !== 'string') return true;
    const normalized = entry.trim().toLowerCase();
    return normalized.length > 0 && !notebookServiceTagCanonicalMap.has(normalized);
  });
}

function hasInvalidQueryTags(value: string | undefined): boolean {
  if (!value) return false;

  const parts = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return parts.some((entry) => !notebookServiceTagCanonicalMap.has(entry));
}

function toResponseNote(note: NotebookNoteRecord): NotebookNoteRecord {
  return {
    noteId: note.noteId,
    email: note.email,
    note: note.note,
    tags: note.tags,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  };
}

function sortByUpdatedAtDesc(left: { updatedAt: string; noteId: string }, right: { updatedAt: string; noteId: string }): number {
  const updatedCompare = right.updatedAt.localeCompare(left.updatedAt);
  if (updatedCompare !== 0) return updatedCompare;
  return right.noteId.localeCompare(left.noteId);
}

function filterNotesByKeyword(notes: NotebookNoteRecord[], keyword: string): NotebookNoteRecord[] {
  if (!keyword) return notes;
  return notes.filter((item) => item.note.toLowerCase().includes(keyword));
}

async function listFilteredNotes(input: {
  email: string;
  selectedTags: string[];
  keyword: string;
}): Promise<NotebookNoteRecord[]> {
  if (input.selectedTags.length === 0) {
    const allUserNotes = await listNotebookNotesByUser(input.email);
    return filterNotesByKeyword(allUserNotes, input.keyword).sort(sortByUpdatedAtDesc);
  }

  const tagLinksByTag = await Promise.all(
    input.selectedTags.map((tag) => listNotebookTagLinksByUserTag(input.email, tag))
  );

  const noteTimestampMap = new Map<string, string>();
  for (const tagLinks of tagLinksByTag) {
    for (const link of tagLinks) {
      const existingTimestamp = noteTimestampMap.get(link.noteId);
      if (!existingTimestamp || link.updatedAt > existingTimestamp) {
        noteTimestampMap.set(link.noteId, link.updatedAt);
      }
    }
  }

  const orderedNoteIds = Array.from(noteTimestampMap.entries())
    .map(([noteId, updatedAt]) => ({ noteId, updatedAt }))
    .sort(sortByUpdatedAtDesc)
    .map((item) => item.noteId);

  const notes = await batchGetNotebookNotesByIds(input.email, orderedNoteIds);
  const notesById = new Map(notes.map((item) => [item.noteId, item]));

  const orderedNotes = orderedNoteIds
    .map((noteId) => notesById.get(noteId))
    .filter((item): item is NotebookNoteRecord => item !== undefined)
    .filter((item) => item.tags.some((tag) => input.selectedTags.includes(tag)));

  return filterNotesByKeyword(orderedNotes, input.keyword).sort(sortByUpdatedAtDesc);
}

async function handleList(event: Parameters<APIGatewayProxyHandler>[0], email: string) {
  const query = event.queryStringParameters || {};
  const page = parsePositiveInt(query.page, defaultPage);
  const requestedWindow = parseNonNegativeInt(query.window, 0);
  const pagesPerWindow = Math.max(1, Math.ceil(windowSize / pageSize));

  if (hasInvalidQueryTags(query.tags)) {
    return json(400, { message: 'tags contains unknown AWS service values' });
  }

  let effectivePage = page;
  let effectiveWindow = requestedWindow;
  let didWindowRollover = false;
  if (page > pagesPerWindow) {
    effectivePage = 1;
    effectiveWindow += 1;
    didWindowRollover = true;
  }

  const selectedTags = normalizeTagsFromQuery(query.tags);
  const keyword = normalizeKeyword(query.keyword);
  const filteredNotes = await listFilteredNotes({ email, selectedTags, keyword });

  const windowStart = effectiveWindow * windowSize;
  const windowEnd = windowStart + windowSize;
  const currentWindowNotes = filteredNotes.slice(windowStart, windowEnd);

  const pageStart = (effectivePage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const pageNotes = currentWindowNotes.slice(pageStart, pageEnd);

  const totalFiltered = filteredNotes.length;
  const totalInWindow = currentWindowNotes.length;
  const totalPagesInWindow = totalInWindow === 0 ? 0 : Math.ceil(totalInWindow / pageSize);
  const hasNextWindow = totalFiltered > windowEnd;
  const hasPrevWindow = effectiveWindow > 0;
  const currentPageIndex = effectiveWindow * pagesPerWindow + effectivePage;

  return json(200, {
    count: pageNotes.length,
    notes: pageNotes.map((item) => toResponseNote(item)),
    pagination: {
      requestedPage: page,
      effectivePage,
      size: pageSize,
      windowSize,
      requestedWindow,
      effectiveWindow,
      currentPageIndex,
      didWindowRollover,
      hasNextWindow,
      hasPrevWindow,
      totalFiltered,
      totalInWindow,
      totalPagesInWindow
    }
  });
}

async function handleCreate(event: Parameters<APIGatewayProxyHandler>[0], email: string) {
  const body = parseBody(event.body);
  if (hasInvalidTags(body.tags)) {
    return json(400, { message: 'tags contains unknown AWS service values' });
  }

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const tags = normalizeTags(body.tags);

  if (!note) return json(400, { message: 'note is required' });
  if (note.length > maxNoteLength) return json(400, { message: `note exceeds max length of ${maxNoteLength}` });
  if (tags.length === 0) return json(400, { message: 'tags must include at least one AWS service' });

  const timestamp = new Date().toISOString();
  const noteRecord: NotebookNoteRecord = {
    noteId: randomUUID(),
    email,
    note,
    tags,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await putNotebookNote(noteRecord);
  await putNotebookTagLinks({
    email,
    noteId: noteRecord.noteId,
    tags,
    updatedAt: timestamp
  });

  return json(200, { note: toResponseNote(noteRecord) });
}

async function handleUpdate(event: Parameters<APIGatewayProxyHandler>[0], email: string, noteId: string) {
  const body = parseBody(event.body);
  if (hasInvalidTags(body.tags)) {
    return json(400, { message: 'tags contains unknown AWS service values' });
  }

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const tags = normalizeTags(body.tags);

  if (!note) return json(400, { message: 'note is required' });
  if (note.length > maxNoteLength) return json(400, { message: `note exceeds max length of ${maxNoteLength}` });
  if (tags.length === 0) return json(400, { message: 'tags must include at least one AWS service' });

  const existing = await getNotebookNoteById(email, noteId);
  if (!existing) {
    return json(404, { message: 'Note not found' });
  }

  const updatedAt = new Date().toISOString();
  const nextRecord: NotebookNoteRecord = {
    noteId,
    email,
    note,
    tags,
    createdAt: existing.createdAt,
    updatedAt
  };

  await putNotebookNote(nextRecord);
  await deleteNotebookTagLinks({
    email,
    noteId,
    tags: existing.tags,
    updatedAt: existing.updatedAt
  });
  await putNotebookTagLinks({
    email,
    noteId,
    tags,
    updatedAt
  });

  return json(200, { note: toResponseNote(nextRecord) });
}

async function handleDelete(email: string, noteId: string) {
  const existing = await getNotebookNoteById(email, noteId);
  if (!existing) {
    return json(404, { message: 'Note not found' });
  }

  await deleteNotebookNoteById(email, noteId);
  await deleteNotebookTagLinks({
    email,
    noteId,
    tags: existing.tags,
    updatedAt: existing.updatedAt
  });

  return json(200, { ok: true, deletedNoteId: noteId });
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestFields = { lambda: 'notebook-notes', requestId: event.requestContext.requestId };
  logInfo('Request received', requestFields);

  try {
    const deviceValidation = await validateDeviceForEvent(event);
    if (!deviceValidation.ok) {
      logWarn('Device validation failed', { ...requestFields, message: deviceValidation.message });
      return json(deviceValidation.statusCode, { message: deviceValidation.message });
    }

    const email = getUserEmailFromEvent(event);
    if (!email) {
      logWarn('Missing user email claim', requestFields);
      return json(401, { message: 'Unauthorized' });
    }

    await enrichDeviceIdentityForEvent(event, deviceValidation.deviceId);

    const method = event.httpMethod.toUpperCase();
    const noteId = (event.pathParameters?.noteId || '').trim();

    if (method === 'GET') {
      return await handleList(event, email);
    }

    if (method === 'POST') {
      return await handleCreate(event, email);
    }

    if (method === 'PUT') {
      if (!noteId) return json(400, { message: 'noteId path parameter is required' });
      return await handleUpdate(event, email, noteId);
    }

    if (method === 'DELETE') {
      if (!noteId) return json(400, { message: 'noteId path parameter is required' });
      return await handleDelete(email, noteId);
    }

    return json(405, { message: 'Method not allowed' });
  } catch (error) {
    logError('Handler failed', { ...requestFields, ...errorLogFields(error) });
    return json(500, { message: 'Internal server error' });
  }
};
