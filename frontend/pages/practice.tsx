import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import { apiRequest, DeviceBlockedError } from '../lib/api-client';

type Level = 'practitioner' | 'associate' | 'professional';
type Option = { key: string; text: string };
type Question = {
  questionId?: string;
  examStyle?: string;
  stem: string;
  createdAt?: string;
  explanation?: string;
  options?: Option[];
  correctAnswers?: string[];
};

type Pagination = {
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

const validLevels: Level[] = ['practitioner', 'associate', 'professional'];
const defaultPagination: Pagination = {
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

function parseSelectedLevel(value: string | string[] | undefined): Level | undefined {
  if (!value || Array.isArray(value)) return undefined;
  if ((validLevels as string[]).includes(value)) return value as Level;
  return undefined;
}

function formatClientDateTime(value: string | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function Practice() {
  const router = useRouter();
  const [level, setLevel] = useState<Level | ''>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [checkedResults, setCheckedResults] = useState<Record<string, boolean>>({});
  const [pagination, setPagination] = useState<Pagination>(defaultPagination);

  function getQuestionKey(question: Question, index: number): string {
    return question.questionId ? `${question.questionId}_${question.createdAt}` : `question-${index}`;
  }

  function isMultipleChoice(question: Question): boolean {
    if ((question.correctAnswers?.length || 0) > 1) return true;
    return question.examStyle?.toLowerCase().includes('multi') || false;
  }

  function selectAnswer(questionKey: string, optionKey: string, multiple: boolean): void {
    setSelectedAnswers((prev) => {
      const existing = prev[questionKey] || [];
      const next = multiple
        ? existing.includes(optionKey)
          ? existing.filter((value) => value !== optionKey)
          : [...existing, optionKey]
        : [optionKey];

      return { ...prev, [questionKey]: next };
    });

    setCheckedResults((prev) => ({ ...prev, [questionKey]: false }));
  }

  function checkResult(questionKey: string): void {
    setCheckedResults((prev) => ({ ...prev, [questionKey]: true }));
  }

  function isAnswerCorrect(question: Question, picked: string[]): boolean {
    const expected = question.correctAnswers || [];
    if (expected.length === 0) return false;
    if (expected.length !== picked.length) return false;
    const expectedSet = new Set(expected);
    return picked.every((answer) => expectedSet.has(answer));
  }

  async function loadQuestions(nextLevel: Level, page: number, window: number, size: number): Promise<void> {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        level: nextLevel,
        page: String(page),
        size: String(size),
        window: String(window)
      });

      const res = await apiRequest(`/api/practice/questions?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed with status ${res.status}`);

      const data = (await res.json()) as {
        level?: Level;
        questions?: Question[];
        pagination?: Pagination;
      };

      setLevel(data.level || nextLevel);
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      setPagination(data.pagination || { ...defaultPagination, size });
      setSelectedAnswers({});
      setCheckedResults({});
    } catch (err) {
      if (err instanceof DeviceBlockedError) {
        router.replace('/blocked');
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!router.isReady) return;

    const selectedLevel = parseSelectedLevel(router.query.level);
    if (!selectedLevel) {
      setError('Please choose a level from the home page first.');
      setLoading(false);
      return;
    }

    setLevel(selectedLevel);
    void loadQuestions(selectedLevel, 1, 0, defaultPagination.size);
  }, [router.isReady, router.query.level]);

  function goToPrevPage(): void {
    if (!level) return;

    if (pagination.effectivePage > 1) {
      void loadQuestions(level, pagination.effectivePage - 1, pagination.effectiveWindow, pagination.size);
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
      void loadQuestions(level, lastPageOfPreviousWindow, previousWindow, pagination.size);
    }
  }

  function goToNextPage(): void {
    if (!level) return;
    const pagesPerWindow = Math.max(1, Math.ceil(pagination.windowSize / pagination.size));

    if (pagination.effectivePage < pagination.totalPagesInWindow) {
      void loadQuestions(level, pagination.effectivePage + 1, pagination.effectiveWindow, pagination.size);
      return;
    }

    if (pagination.hasNextWindow) {
      void loadQuestions(
        level,
        pagesPerWindow + 1,
        pagination.effectiveWindow,
        pagination.size
      );
    }
  }

  function changePageSize(size: number): void {
    if (!level) return;
    void loadQuestions(level, 1, 0, size);
  }

  const pagesPerWindow = Math.max(1, Math.ceil(pagination.windowSize / pagination.size));
  const globalEffectivePage = pagination.effectiveWindow * pagesPerWindow + pagination.effectivePage;
  const currentPageIndex = pagination.currentPageIndex ?? globalEffectivePage;
  const totalPages = pagination.totalFiltered === 0 ? 0 : Math.ceil(pagination.totalFiltered / pagination.size);
  const currentPageDisplay = totalPages === 0 ? 0 : currentPageIndex;

  return (
    <>
      <Head>
        <title>AWS Practice | Practice</title>
      </Head>
      <main className="min-h-screen px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-6">
          <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-brand-600 dark:text-brand-500">Practice session</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">Practice ({level || '-'})</h1>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Home
              </Link>
              <ThemeToggle />
            </div>
          </header>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {pagination.totalFiltered} published questions in this level | page: {currentPageDisplay}/{totalPages}
              </p>
              <label className="text-sm">
                <span className="mr-2 text-slate-600 dark:text-slate-300">Page size</span>
                <select
                  value={pagination.size}
                  onChange={(event) => changePageSize(Number.parseInt(event.target.value, 10))}
                  disabled={loading || !level}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>
          </section>

          {loading && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300">Loading questions...</p>
            </section>
          )}

          {error && (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900 dark:bg-red-950 sm:p-5">
              <p className="text-sm text-red-700 dark:text-red-200">Failed to load questions: {error}</p>
            </section>
          )}

          {!loading && !error && (
            <section className="grid gap-3 sm:gap-5">
              {questions.map((q, i) => {
                const questionKey = getQuestionKey(q, i);
                const multiple = isMultipleChoice(q);
                const selected = selectedAnswers[questionKey] || [];
                const checked = checkedResults[questionKey] || false;
                const correct = checked ? isAnswerCorrect(q, selected) : false;

                return (
                  <article
                    key={questionKey}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900 sm:p-5"
                  >
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      <span className="mr-2 text-brand-600 dark:text-brand-500">
                        #{(currentPageIndex - 1) * pagination.size + i + 1}
                      </span>
                      {q.stem}
                    </h2>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Created: {formatClientDateTime(q.createdAt)}
                    </p>

                    <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {multiple ? 'Multiple answers' : 'Single answer'}
                    </p>

                    <ul className="mt-3 space-y-2">
                      {q.options?.map((o) => (
                        <li key={o.key}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <input
                              type={multiple ? 'checkbox' : 'radio'}
                              name={`question-${questionKey}`}
                              value={o.key}
                              checked={selected.includes(o.key)}
                              onChange={() => selectAnswer(questionKey, o.key, multiple)}
                              className="mt-0.5 h-4 w-4"
                            />
                            <span>
                              <span className="mr-2 font-semibold">{o.key}.</span>
                              {o.text}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex items-center gap-3">
                      <button
                        onClick={() => checkResult(questionKey)}
                        disabled={selected.length === 0}
                        className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Check result
                      </button>

                      {checked && (
                        <p className={`text-sm font-semibold ${correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {correct ? 'Correct' : 'Not correct yet'}
                        </p>
                      )}
                    </div>

                    {checked && q.explanation && (
                      <section className="mt-4 rounded-lg border border-slate-200 p-3 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        <p className="font-medium text-slate-900 dark:text-white">Explanation</p>
                        <p className="mt-2 leading-relaxed">{q.explanation}</p>
                      </section>
                    )}
                  </article>
                );
              })}

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Current page: {currentPageDisplay}/{totalPages}
                    {pagination.didWindowRollover ? ' (window rollover)' : ''}
                  </p>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={goToPrevPage}
                      disabled={loading || !level || (!pagination.hasPrevWindow && pagination.effectivePage <= 1)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Previous
                    </button>
                    <button
                      onClick={goToNextPage}
                      disabled={loading || !level || (!pagination.hasNextWindow && pagination.effectivePage >= pagination.totalPagesInWindow)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </section>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
