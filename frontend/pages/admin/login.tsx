import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import ThemeToggle from '../../components/ThemeToggle';
import { ensureAdminSession } from '../../lib/admin-gate';

export default function AdminLogin() {
  const [message, setMessage] = useState('Checking session...');
  const router = useRouter();

  useEffect(() => {
    async function bootstrap(): Promise<void> {
      const decision = await ensureAdminSession();
      if (decision === 'allow') {
        await router.replace('/admin');
        return;
      }

      setMessage('Admin access requires an admin account. Redirecting to sign in...');
      await router.replace('/login');
    }

    void bootstrap();
  }, [router]);

  return (
    <>
      <Head>
        <title>AWS Practice | Admin Access</title>
      </Head>
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-600 dark:text-brand-500">Admin access</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">Admin Access</h1>
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

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <p className="text-sm text-slate-700 dark:text-slate-200">{message}</p>
        </section>
        </div>
      </main>
    </>
  );
}
