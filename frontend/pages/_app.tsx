import type { AppProps } from 'next/app';
import Head from 'next/head';
import Link from 'next/link';
import NotebookShell from '../components/NotebookShell';
import UserMenu from '../components/UserMenu';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="px-3 py-3 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
            <Link href="/" className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">
              AWS Practice
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>
      <Component {...pageProps} />
      <NotebookShell />
    </>
  );
}
