import Head from 'next/head';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';

export default function BlockedPage() {
  return (
    <>
      <Head>
        <title>AWS Practice | Device Blocked</title>
      </Head>
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <header className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400">Access blocked</p>
            <ThemeToggle />
          </header>

          <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-sm dark:border-rose-900 dark:bg-rose-950 sm:p-8">
            <h1 className="text-2xl font-bold text-rose-700 dark:text-rose-200 sm:text-3xl">You are blocked</h1>
            <p className="mt-3 text-sm text-rose-700 dark:text-rose-200 sm:text-base">
              This browser device has been revoked and cannot access this application.
            </p>
            <p className="mt-2 text-sm text-rose-700 dark:text-rose-200 sm:text-base">
              If you think this is a mistake, contact an administrator.
            </p>
          </section>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Home
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
