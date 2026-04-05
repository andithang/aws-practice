import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import ThemeToggle from '../../components/ThemeToggle';
import {
  AdminBatch,
  AdminQuestion,
  AdminQuestionAction,
  AdminQuestionsPagination,
  AdminUnauthorizedError,
  listAdminBatches,
  listAdminQuestions,
  updateAdminQuestionAnswer,
  updateAdminQuestionsStatus
} from '../../lib/admin-api';
import { clearAdminToken, hasAdminToken } from '../../lib/admin-auth';

type LevelFilter = '' | 'practitioner' | 'associate' | 'professional';

type QuestionFilters = {
  level: LevelFilter;
  createdFrom: string;
  createdTo: string;
  keyword: string;
  batchIds: string[];
};

const defaultFilters: QuestionFilters = {
  level: '',
  createdFrom: '',
  createdTo: '',
  keyword: '',
  batchIds: []
};

const defaultPagination: AdminQuestionsPagination = {
  requestedPage: 1,
  effectivePage: 1,
  size: 20,
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

function formatClientDateTime(value: string | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminQuestionsPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [batches, setBatches] = useState<AdminBatch[]>([]);
  const [filtersDraft, setFiltersDraft] = useState<QuestionFilters>(defaultFilters);
  const [filtersApplied, setFiltersApplied] = useState<QuestionFilters>(defaultFilters);
  const [pagination, setPagination] = useState<AdminQuestionsPagination>(defaultPagination);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<AdminQuestionAction | ''>('');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingAnswers, setEditingAnswers] = useState<string[]>([]);
  const [savingAnswerId, setSavingAnswerId] = useState<string | null>(null);

  const batchOptions = useMemo(
    () =>
      [...batches]
        .sort((left, right) => right.date.localeCompare(left.date))
        .map((batch) => ({
          id: batch.batchId,
          label: `${batch.date} • ${batch.level} • ${batch.batchId}`
        })),
    [batches]
  );

  function goToLogin(): void {
    clearAdminToken();
    router.replace('/admin/login');
  }

  async function loadQuestions(
    nextPage = pagination.effectivePage,
    nextWindow = pagination.effectiveWindow,
    nextSize = pagination.size,
    nextFilters = filtersApplied
  ): Promise<void> {
    setLoading(true);
    setError('');

    try {
      const result = await listAdminQuestions({
        page: nextPage,
        size: nextSize,
        window: nextWindow,
        level: nextFilters.level || undefined,
        batchIds: nextFilters.batchIds,
        createdFrom: nextFilters.createdFrom || undefined,
        createdTo: nextFilters.createdTo || undefined,
        keyword: nextFilters.keyword || undefined
      });

      setQuestions(result.questions);
      setPagination(result.pagination);
      setFiltersApplied(nextFilters);
      setSelectedQuestionIds([]);
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        goToLogin();
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load questions';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadBatchOptions(): Promise<void> {
    try {
      const response = await listAdminBatches();
      setBatches(response);
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        goToLogin();
        return;
      }
      throw err;
    }
  }

  useEffect(() => {
    if (!hasAdminToken()) {
      goToLogin();
      return;
    }

    async function bootstrap(): Promise<void> {
      try {
        await loadBatchOptions();
        await loadQuestions(1, 0, defaultPagination.size, defaultFilters);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to initialize page';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  function toggleSelectedQuestion(id: string): void {
    setSelectedQuestionIds((previous) =>
      previous.includes(id) ? previous.filter((entry) => entry !== id) : [...previous, id]
    );
  }

  function toggleSelectAllCurrentPage(): void {
    const currentIds = questions.map((question) => question.id);
    const allSelected = currentIds.length > 0 && currentIds.every((id) => selectedQuestionIds.includes(id));
    if (allSelected) {
      setSelectedQuestionIds((previous) => previous.filter((id) => !currentIds.includes(id)));
      return;
    }
    setSelectedQuestionIds((previous) => Array.from(new Set([...previous, ...currentIds])));
  }

  async function updateQuestions(action: AdminQuestionAction, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    setPendingAction(action);
    setError('');

    try {
      await updateAdminQuestionsStatus(action, ids);
      await loadQuestions(
        pagination.effectivePage,
        pagination.effectiveWindow,
        pagination.size,
        filtersApplied
      );
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        goToLogin();
        return;
      }
      const message = err instanceof Error ? err.message : 'Update failed';
      setError(message);
    } finally {
      setPendingAction('');
    }
  }

  function isMultiSelect(question: AdminQuestion): boolean {
    if (question.correctAnswers.length > 1) return true;
    return question.examStyle.toLowerCase().includes('multi');
  }

  function beginAnswerEdit(question: AdminQuestion): void {
    setEditingQuestionId(question.id);
    setEditingAnswers(question.correctAnswers);
  }

  function cancelAnswerEdit(): void {
    setEditingQuestionId(null);
    setEditingAnswers([]);
  }

  function toggleEditingAnswer(question: AdminQuestion, optionKey: string): void {
    const multiple = isMultiSelect(question);
    setEditingAnswers((previous) => {
      if (!multiple) return [optionKey];
      if (previous.includes(optionKey)) {
        return previous.filter((answer) => answer !== optionKey);
      }
      return [...previous, optionKey];
    });
  }

  async function saveAnswerEdit(question: AdminQuestion): Promise<void> {
    const multiple = isMultiSelect(question);
    if (!multiple && editingAnswers.length !== 1) {
      setError('Single-select questions require exactly one correct answer.');
      return;
    }

    if (multiple && editingAnswers.length < 1) {
      setError('Multi-select questions require at least one correct answer.');
      return;
    }

    setSavingAnswerId(question.id);
    setError('');

    try {
      await updateAdminQuestionAnswer(question.id, editingAnswers);
      await loadQuestions(
        pagination.effectivePage,
        pagination.effectiveWindow,
        pagination.size,
        filtersApplied
      );
      cancelAnswerEdit();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        goToLogin();
        return;
      }
      const message = err instanceof Error ? err.message : 'Answer update failed';
      setError(message);
    } finally {
      setSavingAnswerId(null);
    }
  }

  function applyFilters(): void {
    void loadQuestions(1, 0, pagination.size, filtersDraft);
  }

  function clearFilters(): void {
    setFiltersDraft(defaultFilters);
    void loadQuestions(1, 0, pagination.size, defaultFilters);
  }

  function changePageSize(size: number): void {
    void loadQuestions(1, 0, size, filtersApplied);
  }

  function goToPrevPage(): void {
    if (pagination.effectivePage > 1) {
      void loadQuestions(
        pagination.effectivePage - 1,
        pagination.effectiveWindow,
        pagination.size,
        filtersApplied
      );
      return;
    }

    if (pagination.hasPrevWindow) {
      const previousWindow = Math.max(0, pagination.effectiveWindow - 1);
      const previousWindowStart = previousWindow * pagination.windowSize;
      const previousWindowCount = Math.max(
        0,
        Math.min(pagination.windowSize, pagination.totalFiltered - previousWindowStart)
      );
      const lastPageOfPreviousWindow =
        previousWindowCount > 0 ? Math.ceil(previousWindowCount / pagination.size) : 1;
      void loadQuestions(lastPageOfPreviousWindow, previousWindow, pagination.size, filtersApplied);
    }
  }

  function goToNextPage(): void {
    const pagesPerWindow = Math.max(1, Math.ceil(pagination.windowSize / pagination.size));

    if (pagination.effectivePage < pagination.totalPagesInWindow) {
      void loadQuestions(
        pagination.effectivePage + 1,
        pagination.effectiveWindow,
        pagination.size,
        filtersApplied
      );
      return;
    }

    if (pagination.hasNextWindow) {
      void loadQuestions(
        pagesPerWindow + 1,
        pagination.effectiveWindow,
        pagination.size,
        filtersApplied
      );
    }
  }

  function signOut(): void {
    goToLogin();
  }

  const allCurrentSelected =
    questions.length > 0 && questions.every((question) => selectedQuestionIds.includes(question.id));
  const pagesPerWindow = Math.max(1, Math.ceil(pagination.windowSize / pagination.size));
  const globalEffectivePage = pagination.effectiveWindow * pagesPerWindow + pagination.effectivePage;
  const globalRequestedPage = pagination.requestedWindow * pagesPerWindow + pagination.requestedPage;

  return (
    <>
      <Head>
        <title>AWS Practice | Admin Questions</title>
      </Head>
    <main className="min-h-screen px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-6">
        <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-600 dark:text-brand-500">Admin dashboard</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">Questions Management</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Home
            </Link>
            <Link
              href="/admin"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Batches
            </Link>
            <button
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Sign out
            </button>
            <ThemeToggle />
          </div>
        </header>

        {error && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900 dark:bg-red-950 sm:p-5">
            <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Level</span>
              <select
                value={filtersDraft.level}
                onChange={(event) =>
                  setFiltersDraft((previous) => ({
                    ...previous,
                    level: event.target.value as QuestionFilters['level']
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">All levels</option>
                <option value="practitioner">Practitioner</option>
                <option value="associate">Associate</option>
                <option value="professional">Professional</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Created from</span>
              <input
                type="date"
                value={filtersDraft.createdFrom}
                onChange={(event) =>
                  setFiltersDraft((previous) => ({ ...previous, createdFrom: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Created to</span>
              <input
                type="date"
                value={filtersDraft.createdTo}
                onChange={(event) =>
                  setFiltersDraft((previous) => ({ ...previous, createdTo: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Page size</span>
              <select
                value={pagination.size}
                onChange={(event) => changePageSize(Number.parseInt(event.target.value, 10))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Keyword</span>
              <input
                type="text"
                placeholder="questionId, topic, stem, explanation"
                value={filtersDraft.keyword}
                onChange={(event) =>
                  setFiltersDraft((previous) => ({ ...previous, keyword: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Batches</span>
              <select
                multiple
                value={filtersDraft.batchIds}
                onChange={(event) => {
                  const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
                  setFiltersDraft((previous) => ({ ...previous, batchIds: selected }));
                }}
                className="h-28 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {batchOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={applyFilters}
              disabled={loading || pendingAction !== ''}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Apply filters
            </button>
            <button
              onClick={clearFilters}
              disabled={loading || pendingAction !== ''}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Clear filters
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Questions</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {pagination.totalFiltered} matched | window {pagination.effectiveWindow + 1} | page {globalEffectivePage}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => updateQuestions('publish', selectedQuestionIds)}
                disabled={selectedQuestionIds.length === 0 || pendingAction !== '' || editingQuestionId !== null}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === 'publish' ? 'Publishing...' : `Publish selected (${selectedQuestionIds.length})`}
              </button>
              <button
                onClick={() => updateQuestions('deprecate', selectedQuestionIds)}
                disabled={selectedQuestionIds.length === 0 || pendingAction !== '' || editingQuestionId !== null}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pendingAction === 'deprecate' ? 'Deprecating...' : `Deprecate selected (${selectedQuestionIds.length})`}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Loading questions...</p>
          ) : questions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              No questions found for current filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left dark:border-slate-700">
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allCurrentSelected}
                        onChange={toggleSelectAllCurrentPage}
                        aria-label="Select all questions on this page"
                      />
                    </th>
                    <th className="min-w-[18rem] px-3 py-2">Question</th>
                    <th className="px-3 py-2">Level</th>
                    <th className="px-3 py-2">Batch</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="min-w-[18rem] px-3 py-2">Correct answers</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((question) => {
                    const isEditing = editingQuestionId === question.id;
                    const isMulti = isMultiSelect(question);

                    return (
                      <tr key={question.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedQuestionIds.includes(question.id)}
                            onChange={() => toggleSelectedQuestion(question.id)}
                            aria-label={`Select question ${question.questionId}`}
                          />
                        </td>
                        <td className="min-w-[18rem] px-3 py-3">
                          <p className="font-semibold text-slate-900 dark:text-white">{question.questionId}</p>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">{question.stem}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-200">{question.level}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-200">{question.batchId}</td>
                        <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                          {formatClientDateTime(question.createdAt)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              question.isPublished
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
                            }`}
                          >
                            {question.isPublished ? 'published' : 'deprecated'}
                          </span>
                        </td>
                        <td className="min-w-[18rem] px-3 py-3">
                          {isEditing ? (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                {isMulti ? 'Multi-select' : 'Single-select'}
                              </p>
                              <div className="space-y-1">
                                {question.options.map((option) => (
                                  <label
                                    key={option.key}
                                    className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-200"
                                  >
                                    <input
                                      type={isMulti ? 'checkbox' : 'radio'}
                                      name={`answer-${question.id}`}
                                      checked={editingAnswers.includes(option.key)}
                                      onChange={() => toggleEditingAnswer(question, option.key)}
                                    />
                                    <span>
                                      {option.key}. {option.text}
                                    </span>
                                  </label>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => saveAnswerEdit(question)}
                                  disabled={savingAnswerId === question.id || pendingAction !== ''}
                                  className="rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {savingAnswerId === question.id ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={cancelAnswerEdit}
                                  disabled={savingAnswerId === question.id || pendingAction !== ''}
                                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs text-slate-700 dark:text-slate-200">
                                {question.correctAnswers.length > 0 ? question.correctAnswers.join(', ') : '-'}
                              </p>
                              <button
                                onClick={() => beginAnswerEdit(question)}
                                disabled={pendingAction !== '' || editingQuestionId !== null}
                                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Edit answers
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {question.isPublished ? (
                            <button
                              onClick={() => updateQuestions('deprecate', [question.id])}
                              disabled={pendingAction !== '' || editingQuestionId !== null}
                              className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Deprecate
                            </button>
                          ) : (
                            <button
                              onClick={() => updateQuestions('publish', [question.id])}
                              disabled={pendingAction !== '' || editingQuestionId !== null}
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Publish
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Requested page {globalRequestedPage} | Effective page {globalEffectivePage}
              {pagination.didWindowRollover && ' (window rollover)'}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevPage}
                disabled={
                  loading ||
                  pendingAction !== '' ||
                  editingQuestionId !== null ||
                  (!pagination.hasPrevWindow && pagination.effectivePage <= 1)
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Previous
              </button>
              <button
                onClick={goToNextPage}
                disabled={
                  loading ||
                  pendingAction !== '' ||
                  editingQuestionId !== null ||
                  (!pagination.hasNextWindow && pagination.effectivePage >= pagination.totalPagesInWindow)
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
    </>
  );
}

