import Head from 'next/head';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import ThemeToggle from '../components/ThemeToggle';
import { buildPostResetLoginRoute } from '../lib/password-reset-gate';
import { confirmForgotPassword } from '../lib/forgot-password-api';

function getEmailFromQuery(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  return '';
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const prefilledEmail = useMemo(() => getEmailFromQuery(router.query.email), [router.query.email]);
  const [email, setEmail] = useState(prefilledEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, [prefilledEmail]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await confirmForgotPassword({ email, code, newPassword });
      await router.replace(buildPostResetLoginRoute());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>AWS Practice | Reset Password</title>
      </Head>
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Reset password</h1>
            <ThemeToggle />
          </header>

          <form onSubmit={(event) => void onSubmit(event)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Reset code
              <input
                type="text"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              New password
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Resetting...' : 'Reset password'}
            </button>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Need a new code? <Link className="text-brand-600 hover:underline" href="/forgot-password">Request one</Link>
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Back to <Link className="text-brand-600 hover:underline" href="/login">log in</Link>
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
