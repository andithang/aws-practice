import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ThemeToggle from '../components/ThemeToggle';
import { apiUrl } from '../lib/api';

type Level = 'practitioner' | 'associate' | 'professional';
type Option = { key: string; text: string };
type Question = {
  questionId?: string;
  examStyle?: string;
  stem: string;
  explanation?: string;
  options?: Option[];
  correctAnswers?: string[];
};

const validLevels: Level[] = ['practitioner', 'associate', 'professional'];

function parseSelectedLevel(value: string | string[] | undefined): Level | undefined {
  if (!value || Array.isArray(value)) return undefined;
  if ((validLevels as string[]).includes(value)) return value as Level;
  return undefined;
}

export default function Practice() {
  const router = useRouter();
  const [level, setLevel] = useState<string>('-');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [checkedResults, setCheckedResults] = useState<Record<string, boolean>>({});

  function getQuestionKey(question: Question, index: number): string {
    return question.questionId || `question-${index}`;
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

  useEffect(() => {
    if (!router.isReady) return;

    const selectedLevel = parseSelectedLevel(router.query.level);
    if (!selectedLevel) {
      setError('Please choose a level from the home page first.');
      setLoading(false);
      return;
    }

    async function loadQuestions() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(apiUrl(`/api/practice/questions?level=${selectedLevel}`));
        if (!res.ok) throw new Error(`Failed with status ${res.status}`);
        const data = await res.json();
        setLevel(data.level || selectedLevel);
        setQuestions(data.questions || []);
        setSelectedAnswers({});
        setCheckedResults({});
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadQuestions();
  }, [router.isReady, router.query.level]);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-600 dark:text-brand-500">Practice session</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">Practice ({level})</h1>
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

        {loading && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-300">Loading questions...</p>
          </section>
        )}

        {error && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-900 dark:bg-red-950">
            <p className="text-sm text-red-700 dark:text-red-200">Failed to load questions: {error}</p>
          </section>
        )}

        {!loading && !error && (
        <section className="grid gap-4 sm:gap-5">
            {questions.map((q, i) => (
              (() => {
                const questionKey = getQuestionKey(q, i);
                const multiple = isMultipleChoice(q);
                const selected = selectedAnswers[questionKey] || [];
                const checked = checkedResults[questionKey] || false;
                const correct = checked ? isAnswerCorrect(q, selected) : false;

                return (
                  <article
                    key={questionKey}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                  >
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      <span className="mr-2 text-brand-600 dark:text-brand-500">#{i + 1}</span>
                      {q.stem}
                    </h2>

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
              })()
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
