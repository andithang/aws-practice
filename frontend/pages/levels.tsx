import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import ThemeToggle from '../components/ThemeToggle';
import { getValidIdToken, signOut } from '../lib/cognito-auth';

const levels = [
  { value: 'practitioner', label: 'Practitioner' },
  { value: 'associate', label: 'Associate' },
  { value: 'professional', label: 'Professional' }
] as const;

export default function LevelsPage() {
  const router = useRouter();
  const [selectedLevel, setSelectedLevel] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkAuth() {
      const token = await getValidIdToken();
      if (!token) {
        await router.replace('/login');
        return;
      }

      if (!cancelled) setReady(true);
    }

    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function startPractice(): void {
    if (!selectedLevel) return;
    router.push({ pathname: '/practice', query: { level: selectedLevel } });
  }

  function logout(): void {
    signOut();
    void router.replace('/login');
  }

  if (!ready) {
    return null;
  }

  return (
    <>
      <Head>
        <title>AWS Practice | Choose Level</title>
      </Head>
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-8">
          <header className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-500">
              AWS Practice
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={logout}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Log out
              </button>
              <ThemeToggle />
            </div>
          </header>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
            <h1 className="text-3xl font-bold leading-tight text-slate-900 dark:text-white sm:text-4xl">
              Choose your certification level
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
              Pick one level to start practicing. You can switch levels any time.
            </p>

            <div className="mt-8 max-w-sm space-y-3">
              <label htmlFor="level-select" className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
                Choose your level
              </label>
              <select
                id="level-select"
                value={selectedLevel}
                onChange={(event) => setSelectedLevel(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">Select a level</option>
                {levels.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>

              <button
                onClick={startPractice}
                disabled={!selectedLevel}
                className="inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Start practicing
              </button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
