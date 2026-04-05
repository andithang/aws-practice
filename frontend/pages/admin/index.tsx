import { useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import ThemeToggle from '../../components/ThemeToggle';
import {
  AdminBatch,
  AdminUnauthorizedError,
  deprecateAdminBatch,
  generateAdminBatch,
  listAdminBatches,
  publishAdminBatch
} from '../../lib/admin-api';
import { clearAdminToken, hasAdminToken } from '../../lib/admin-auth';

type ActionType = 'generate' | 'publish' | 'deprecate';

export default function Admin() {
  const router = useRouter();
  const [batches, setBatches] = useState<AdminBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<ActionType | ''>('');

  function goToLogin(): void {
    clearAdminToken();
    router.replace('/admin/login');
  }

  async function loadBatches() {
    setError('');
    try {
      const nextBatches = await listAdminBatches();
      setBatches(nextBatches);
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

    async function bootstrap() {
      try {
        await loadBatches();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  async function generate() {
    setPendingAction('generate');
    setError('');
    try {
      await generateAdminBatch();
      await loadBatches();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        goToLogin();
        return;
      }
      const message = err instanceof Error ? err.message : 'Generation failed';
      setError(message);
    } finally {
      setPendingAction('');
    }
  }

  async function mark(action: 'publish' | 'deprecate', batch: AdminBatch) {
    setPendingAction(action);
    setError('');
    try {
      if (action === 'publish') {
        await publishAdminBatch(batch);
      } else {
        await deprecateAdminBatch(batch);
      }
      await loadBatches();
    } catch (err) {
      if (err instanceof AdminUnauthorizedError) {
        goToLogin();
        return;
      }
      const message = err instanceof Error ? err.message : 'Action failed';
      setError(message);
    } finally {
      setPendingAction('');
    }
  }

  function signOut() {
    goToLogin();
  }

  const sortedBatches = [...batches].sort((left, right) => {
    if (left.date === right.date) {
      return left.level.localeCompare(right.level);
    }
    return right.date.localeCompare(left.date);
  });

  if (loading) {
    return (
      <>
        <Head>
          <title>AWS Practice | Admin Batches</title>
        </Head>
        <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-sm text-slate-600 dark:text-slate-300">Loading batches...</p>
            </section>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>AWS Practice | Admin Batches</title>
      </Head>
      <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-600 dark:text-brand-500">Admin dashboard</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">Question Batches</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Home
            </Link>
            <Link
              href="/admin/questions"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Questions
            </Link>
            <button
              onClick={generate}
              disabled={pendingAction !== ''}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === 'generate' ? 'Generating...' : 'Trigger generation'}
            </button>
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
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm dark:border-red-900 dark:bg-red-950">
            <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Available batches</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{sortedBatches.length} total</p>
          </div>

          {sortedBatches.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              No batches found yet.
            </p>
          )}

          <ul className="grid gap-3">
            {sortedBatches.map((batch) => {
                const status = batch.status.toLowerCase();
                const showPublish = status !== 'published';
                const showDeprecate = status !== 'deprecated';

                return (
                  <li
                    key={batch.batchId}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-500">
                        {batch.level}
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-200">{batch.date}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Status: {batch.status}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {showPublish && (
                        <button
                          onClick={() => mark('publish', batch)}
                          disabled={pendingAction !== ''}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingAction === 'publish' ? 'Working...' : 'Publish'}
                        </button>
                      )}
                      {showDeprecate && (
                        <button
                          onClick={() => mark('deprecate', batch)}
                          disabled={pendingAction !== ''}
                          className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingAction === 'deprecate' ? 'Working...' : 'Deprecate'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
        </div>
      </main>
    </>
  );
}
