import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-500">
            AWS Practice
          </span>
          <ThemeToggle />
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
          <h1 className="text-3xl font-bold leading-tight text-slate-900 dark:text-white sm:text-4xl">
            AWS Exam Practice
          </h1>
          <p className="mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
            Practice with daily AI-generated AWS exam-style questions and review concise explanations to build confidence.
          </p>
          <div className="mt-8">
            <Link
              href="/practice"
              className="inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              Start practicing
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
