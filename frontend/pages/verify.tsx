import Head from 'next/head';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import ThemeToggle from '../components/ThemeToggle';
import { confirmSignUp, resendConfirmationCode } from '../lib/cognito-auth';
import { mustShowVerificationRequired } from '../lib/auth-gate';

function getEmailFromQuery(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  return '';
}

export default function VerifyPage() {
  const router = useRouter();
  const prefilledEmail = useMemo(() => getEmailFromQuery(router.query.email), [router.query.email]);
  const showVerificationRequired = useMemo(
    () => mustShowVerificationRequired(router.query.required),
    [router.query.required]
  );
  const [email, setEmail] = useState(prefilledEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, [prefilledEmail]);

  async function onVerify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      await confirmSignUp(email, code);
      setMessage('Email verified. You can now log in.');
      await router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify account');
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend(): Promise<void> {
    setError('');
    setMessage('');
    setResending(true);
    try {
      await resendConfirmationCode(email);
      setMessage('Verification code sent. Please check your email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification code');
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <Head>
        <title>AWS Practice | Verify Email</title>
      </Head>
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Verify email</h1>
            <ThemeToggle />
          </header>

          <form onSubmit={(event) => void onVerify(event)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {showVerificationRequired && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                You must verify your email before using the website.
              </p>
            )}
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
              Verification code
              <input
                type="text"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
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
                {submitting ? 'Verifying...' : 'Verify'}
              </button>
              <button
                type="button"
                onClick={() => void onResend()}
                disabled={resending}
                className="inline-flex rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {resending ? 'Sending...' : 'Resend code'}
              </button>
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
