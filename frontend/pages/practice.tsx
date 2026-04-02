import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';

type Option = { key: string; text: string };
type Question = {
  questionId?: string;
  stem: string;
  explanation?: string;
  options?: Option[];
};

type Props = { level: string; questions: Question[] };

export default function Practice({ level, questions }: Props) {
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

        <section className="grid gap-4 sm:gap-5">
          {questions.map((q, i) => (
            <article
              key={q.questionId || i}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                <span className="mr-2 text-brand-600 dark:text-brand-500">#{i + 1}</span>
                {q.stem}
              </h2>

              <ul className="mt-4 space-y-2">
                {q.options?.map((o) => (
                  <li
                    key={o.key}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <span className="mr-2 font-semibold">{o.key}.</span>
                    {o.text}
                  </li>
                ))}
              </ul>

              {q.explanation && (
                <details className="mt-4 rounded-lg border border-slate-200 p-3 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  <summary className="cursor-pointer font-medium text-slate-900 dark:text-white">Explanation</summary>
                  <p className="mt-2 leading-relaxed">{q.explanation}</p>
                </details>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const base = process.env.BACKEND_API_BASE_URL || 'http://127.0.0.1:3000';
  const res = await fetch(`${base}/api/practice/questions`);
  const data = await res.json();
  return { props: { level: data.level, questions: data.questions || [] } };
};
