import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { awsServiceTags } from '../lib/aws-service-tags';
import {
  createNotebookNote,
  deleteNotebookNote,
  listNotebookNotes,
  NotebookNote,
  NotebookPagination,
  updateNotebookNote
} from '../lib/notebook-api';
import { getValidIdToken } from '../lib/cognito-auth';
import { DeviceBlockedError } from '../lib/api-client';
import { shouldHideNotebook } from '../lib/notebook-shell-routes';

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

function formatClientDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function matchMediaDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(min-width: 1024px)').matches;
}

function toggleTagSelection(current: string[], tag: string): string[] {
  if (current.includes(tag)) return current.filter((item) => item !== tag);
  return [...current, tag];
}

export default function NotebookShell() {
  const router = useRouter();

  const [signedIn, setSignedIn] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [notes, setNotes] = useState<NotebookNote[]>([]);
  const [pagination, setPagination] = useState<NotebookPagination>(defaultPagination);

  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterKeywordDraft, setFilterKeywordDraft] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');

  const [editorNoteId, setEditorNoteId] = useState<string | null>(null);
  const [editorNoteText, setEditorNoteText] = useState('');
  const [editorTags, setEditorTags] = useState<string[]>([]);
  const [editorTagQuery, setEditorTagQuery] = useState('');
  const [filterTagQuery, setFilterTagQuery] = useState('');
  const panelBodyRef = useRef<HTMLDivElement | null>(null);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const hidden = useMemo(() => shouldHideNotebook(router.pathname), [router.pathname]);
  const normalizedEditorTagQuery = editorTagQuery.trim().toLowerCase();
  const normalizedFilterTagQuery = filterTagQuery.trim().toLowerCase();
  const filteredEditorTagOptions = useMemo(
    () =>
      awsServiceTags.filter((service) =>
        normalizedEditorTagQuery ? service.toLowerCase().includes(normalizedEditorTagQuery) : true
      ),
    [normalizedEditorTagQuery]
  );
  const filteredFilterTagOptions = useMemo(
    () =>
      awsServiceTags.filter((service) =>
        normalizedFilterTagQuery ? service.toLowerCase().includes(normalizedFilterTagQuery) : true
      ),
    [normalizedFilterTagQuery]
  );

  useEffect(() => {
    let cancelled = false;

    async function checkSession(): Promise<void> {
      const token = await getValidIdToken();
      if (!cancelled) setSignedIn(Boolean(token));
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [router.asPath]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setFilterKeyword(filterKeywordDraft.trim());
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [filterKeywordDraft]);

  useEffect(() => {
    if (!open || !signedIn) return;
    void loadNotes(1, 0);
  }, [open, signedIn, filterKeyword, filterTags.join('|')]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    if (!open) return;
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [open]);

  async function loadNotes(page: number, windowIndex: number): Promise<void> {
    setLoading(true);
    setError('');

    try {
      const response = await listNotebookNotes({
        page,
        window: windowIndex,
        tags: filterTags,
        keyword: filterKeyword
      });

      setNotes(response.notes);
      setPagination(response.pagination);
    } catch (err) {
      if (err instanceof DeviceBlockedError) {
        router.replace('/blocked');
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load notes';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function resetEditor(): void {
    setEditorNoteId(null);
    setEditorNoteText('');
    setEditorTags([]);
  }

  async function submitEditor(): Promise<void> {
    setSaving(true);
    setError('');

    try {
      if (editorNoteId) {
        await updateNotebookNote(editorNoteId, {
          note: editorNoteText,
          tags: editorTags
        });
      } else {
        await createNotebookNote({
          note: editorNoteText,
          tags: editorTags
        });
      }

      resetEditor();
      await loadNotes(1, 0);
    } catch (err) {
      if (err instanceof DeviceBlockedError) {
        router.replace('/blocked');
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to save note';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(noteId: string): Promise<void> {
    const previous = notes;
    setNotes((current) => current.filter((item) => item.noteId !== noteId));

    try {
      await deleteNotebookNote(noteId);
      await loadNotes(pagination.effectivePage, pagination.effectiveWindow);
    } catch (err) {
      setNotes(previous);
      if (err instanceof DeviceBlockedError) {
        router.replace('/blocked');
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to delete note';
      setError(message);
    }
  }

  function beginEdit(note: NotebookNote): void {
    setEditorNoteId(note.noteId);
    setEditorNoteText(note.note);
    setEditorTags(note.tags);
    setEditorTagQuery('');

    requestAnimationFrame(() => {
      panelBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      editorTextareaRef.current?.focus();
      editorTextareaRef.current?.setSelectionRange(
        editorTextareaRef.current.value.length,
        editorTextareaRef.current.value.length
      );
    });
  }

  function goToPrevPage(): void {
    if (pagination.effectivePage > 1) {
      void loadNotes(pagination.effectivePage - 1, pagination.effectiveWindow);
      return;
    }

    if (pagination.hasPrevWindow) {
      const previousWindow = Math.max(0, pagination.effectiveWindow - 1);
      const previousWindowStart = previousWindow * pagination.windowSize;
      const previousWindowCount = Math.max(
        0,
        Math.min(pagination.windowSize, pagination.totalFiltered - previousWindowStart)
      );
      const lastPageOfPreviousWindow = previousWindowCount > 0 ? Math.ceil(previousWindowCount / pagination.size) : 1;
      void loadNotes(lastPageOfPreviousWindow, previousWindow);
    }
  }

  function goToNextPage(): void {
    const pagesPerWindow = Math.max(1, Math.ceil(pagination.windowSize / pagination.size));

    if (pagination.effectivePage < pagination.totalPagesInWindow) {
      void loadNotes(pagination.effectivePage + 1, pagination.effectiveWindow);
      return;
    }

    if (pagination.hasNextWindow) {
      void loadNotes(pagesPerWindow + 1, pagination.effectiveWindow);
    }
  }

  const pagesPerWindow = Math.max(1, Math.ceil(pagination.windowSize / pagination.size));
  const globalEffectivePage = pagination.effectiveWindow * pagesPerWindow + pagination.effectivePage;
  const currentPageIndex = pagination.currentPageIndex ?? globalEffectivePage;
  const totalPages = pagination.totalFiltered === 0 ? 0 : Math.ceil(pagination.totalFiltered / pagination.size);
  const currentPageDisplay = totalPages === 0 ? 0 : currentPageIndex;

  if (!signedIn || hidden) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Open notebook"
        onClick={() => {
          setIsDesktop(matchMediaDesktop());
          setOpen(true);
        }}
        className="fixed right-3 top-1/2 z-30 -translate-y-1/2 rounded-full border border-slate-400 bg-white p-3 text-slate-900 shadow-lg transition hover:bg-slate-100 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M7 4h11a2 2 0 0 1 2 2v14H7a3 3 0 0 0-3 3V7a3 3 0 0 1 3-3z" />
          <path d="M7 4v16" />
          <path d="M10 9h7" />
          <path d="M10 13h7" />
        </svg>
      </button>

      {open && !isDesktop && (
        <button
          type="button"
          aria-label="Close notebook"
          className="fixed inset-0 z-30 bg-slate-950/40"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <aside
          className={
            isDesktop
              ? 'fixed right-3 top-20 z-40 flex h-[calc(100vh-6rem)] w-[26rem] flex-col rounded-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-900'
              : 'fixed right-0 top-0 z-40 flex h-full w-[min(26rem,100vw)] flex-col border-l border-slate-300 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-900'
          }
        >
          <header className="flex items-center justify-between border-b border-slate-300 px-4 py-3 dark:border-slate-600">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-500">Notebook</h2>
              <p className="text-xs text-slate-700 dark:text-slate-300">Personal AWS notes</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-400 px-2 py-1 text-xs text-slate-900 hover:bg-slate-100 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Close
            </button>
          </header>

          <div ref={panelBodyRef} className="flex-1 overflow-y-auto px-4 py-3">
            <section className="space-y-2 rounded-xl border border-slate-300 p-3 dark:border-slate-600">
              <label className="text-xs font-medium text-slate-800 dark:text-slate-200">Note</label>
              <textarea
                ref={editorTextareaRef}
                value={editorNoteText}
                maxLength={4000}
                onChange={(event) => setEditorNoteText(event.target.value)}
                rows={4}
                placeholder="Write your AWS study note"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              <label className="text-xs font-medium text-slate-800 dark:text-slate-200">Tags</label>
              <input
                value={editorTagQuery}
                onChange={(event) => setEditorTagQuery(event.target.value)}
                placeholder="Search AWS services"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-950">
                {filteredEditorTagOptions.map((service) => (
                  <label
                    key={`editor-${service}`}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={editorTags.includes(service)}
                      onChange={() => setEditorTags((current) => toggleTagSelection(current, service))}
                      className="h-3.5 w-3.5"
                    />
                    <span>{service}</span>
                  </label>
                ))}
                {filteredEditorTagOptions.length === 0 && (
                  <p className="px-1 py-1 text-xs text-slate-700 dark:text-slate-300">No matching services.</p>
                )}
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">{editorTags.length} tags selected</p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void submitEditor()}
                  disabled={saving || editorNoteText.trim().length === 0 || editorTags.length === 0}
                  className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editorNoteId ? 'Update note' : 'Save note'}
                </button>
                {editorNoteId && (
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="rounded-lg border border-slate-400 px-3 py-2 text-xs text-slate-900 hover:bg-slate-100 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </section>

            <section className="mt-4 space-y-2 rounded-xl border border-slate-300 p-3 dark:border-slate-600">
              <label className="text-xs font-medium text-slate-800 dark:text-slate-200">Search by keyword</label>
              <input
                value={filterKeywordDraft}
                onChange={(event) => setFilterKeywordDraft(event.target.value)}
                placeholder="Search note content"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              <label className="text-xs font-medium text-slate-800 dark:text-slate-200">Filter by tags</label>
              <input
                value={filterTagQuery}
                onChange={(event) => setFilterTagQuery(event.target.value)}
                placeholder="Search AWS services"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-950">
                {filteredFilterTagOptions.map((service) => (
                  <label
                    key={`filter-${service}`}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={filterTags.includes(service)}
                      onChange={() => setFilterTags((current) => toggleTagSelection(current, service))}
                      className="h-3.5 w-3.5"
                    />
                    <span>{service}</span>
                  </label>
                ))}
                {filteredFilterTagOptions.length === 0 && (
                  <p className="px-1 py-1 text-xs text-slate-700 dark:text-slate-300">No matching services.</p>
                )}
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">{filterTags.length} tags selected</p>
            </section>

            <section className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {pagination.totalFiltered} notes | page {currentPageDisplay}/{totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToPrevPage}
                    disabled={loading || (!pagination.hasPrevWindow && pagination.effectivePage <= 1)}
                    className="rounded-lg border border-slate-400 px-2 py-1 text-xs text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={goToNextPage}
                    disabled={loading || (!pagination.hasNextWindow && pagination.effectivePage >= pagination.totalPagesInWindow)}
                    className="rounded-lg border border-slate-400 px-2 py-1 text-xs text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    Next
                  </button>
                </div>
              </div>

              {loading && (
                <p className="text-sm text-slate-700 dark:text-slate-300">Loading notes...</p>
              )}

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  {error}
                </p>
              )}

              {!loading && notes.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-400 bg-slate-50 px-3 py-3 text-xs text-slate-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-200">
                  No notes found for current filters.
                </p>
              )}

              {notes.map((note) => (
                <article
                  key={note.noteId}
                  className="rounded-xl border border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800"
                >
                  <p className="whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">{note.note}</p>
                  <p className="mt-2 text-[11px] text-slate-700 dark:text-slate-300">
                    Updated: {formatClientDateTime(note.updatedAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {note.tags.map((tag) => (
                      <span
                        key={`${note.noteId}-${tag}`}
                        className="rounded-full border border-brand-300 bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-900 dark:border-brand-600 dark:bg-brand-800/70 dark:text-brand-100"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => beginEdit(note)}
                      className="rounded-lg border border-slate-400 px-2 py-1 text-xs text-slate-900 hover:bg-slate-100 dark:border-slate-500 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeNote(note.noteId)}
                      className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </aside>
      )}
    </>
  );
}
