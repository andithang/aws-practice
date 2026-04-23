import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { getCurrentUserEmail, hasStoredSession, signOut } from '../lib/cognito-auth';

function avatarLabel(email: string | null): string {
  if (!email) return '?';
  const first = email.trim().charAt(0);
  return first ? first.toUpperCase() : '?';
}

export default function UserMenu() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(hasStoredSession());

  useEffect(() => {
    let cancelled = false;
    async function loadUser(): Promise<void> {
      const activeSession = hasStoredSession();
      const currentEmail = activeSession ? await getCurrentUserEmail() : null;
      if (cancelled) return;
      setSignedIn(activeSession);
      setEmail(currentEmail);
    }

    void loadUser();
    return () => {
      cancelled = true;
    };
  }, [router.asPath]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  async function handleLogout(): Promise<void> {
    signOut();
    setMenuOpen(false);
    setEmail(null);
    setSignedIn(false);
    await router.replace('/login');
  }

  if (!signedIn) {
    return null;
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        {avatarLabel(email)}
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="truncate text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Signed in as</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-white">{email || 'Not signed in'}</p>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            disabled={!signedIn}
            className="mt-3 w-full rounded-lg border border-red-300 px-3 py-2 text-left text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700/70 dark:text-red-300 dark:hover:bg-red-950/30"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
