import Head from 'next/head';
import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import { requestForgotPassword } from '../lib/forgot-password-api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const normalizedEmail = useMemo(() => email.trim(), [email]);
  const resetHref = normalizedEmail
    ? { pathname: '/reset-password', query: { email: normalizedEmail } }
    : '/reset-password';

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const response = await requestForgotPassword(email);
      setMessage(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to request password reset');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>AWS Practice | Forgot Password</title>
      </Head>
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Forgot password</h1>
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

            {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}
            {message && <p className="text-sm text-emerald-600 dark:text-emerald-300">{message}</p>}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Sending...' : 'Send reset code'}
              </button>
              <Link
                className="inline-flex rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                href={resetHref}
              >
                I have a code
              </Link>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Back to <Link className="text-brand-600 hover:underline" href="/login">log in</Link>
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
