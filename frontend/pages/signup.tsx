import Head from 'next/head';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import ThemeToggle from '../components/ThemeToggle';
import { signUp } from '../lib/cognito-auth';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signUp({ name, email, password });
      await router.replace({ pathname: '/verify', query: { email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign up');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>AWS Practice | Sign Up</title>
      </Head>
      <main className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <header className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Create account</h1>
            <ThemeToggle />
          </header>

          <form onSubmit={(event) => void onSubmit(event)} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Name
              <input
                type="text"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
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
              Password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            {error && <p className="text-sm text-red-600 dark:text-red-300">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing up...' : 'Sign up'}
            </button>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Already have an account? <Link className="text-brand-600 hover:underline" href="/login">Log in</Link>
            </p>
          </form>
        </div>
      </main>
    </>
  );
}
