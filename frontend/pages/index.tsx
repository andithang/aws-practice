import Head from 'next/head';
import { useRouter } from 'next/router';
import { getValidIdToken } from '../lib/cognito-auth';
import ThemeToggle from '../components/ThemeToggle';

export default function Home() {
  const router = useRouter();

  async function getStarted(): Promise<void> {
    const token = await getValidIdToken();
    if (token) {
      await router.push('/levels');
      return;
    }

    await router.push('/login');
  }

  return (
    <>
      <Head>
        <title>AWS Practice | Learn AWS Faster</title>
      </Head>
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
              Master AWS Exam Questions with a Focused Daily Practice Workflow
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
              Sign up once, verify your email, pick your certification level, and continue exactly where you left off.
              Your selected answers are synced to cloud storage for every new visit.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => void getStarted()}
                className="inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                Get Started
              </button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
