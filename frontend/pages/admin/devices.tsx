import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import ThemeToggle from '../../components/ThemeToggle';
import {
  AdminDevice,
  AdminUnauthorizedError,
  listAdminDevices,
  revokeAdminDevice
} from '../../lib/admin-api';
import { clearAdminToken, hasAdminToken } from '../../lib/admin-auth';
import { DeviceBlockedError } from '../../lib/api-client';

function formatClientDateTime(value: string | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function isExpiredDevice(value: string | undefined): boolean {
  if (!value) return false;
  const expiresAt = Date.parse(value);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt <= Date.now();
}

export default function AdminDevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revokingDeviceId, setRevokingDeviceId] = useState('');

  function goToLogin(): void {
    clearAdminToken();
    router.replace('/admin/login');
  }

  async function loadDevices(): Promise<void> {
    setError('');
    try {
      const response = await listAdminDevices();
      setDevices(response);
    } catch (err) {
      if (err instanceof DeviceBlockedError) {
        router.replace('/blocked');
        return;
      }
      if (err instanceof AdminUnauthorizedError) {
        goToLogin();
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to load devices';
      setError(message);
    }
  }

  useEffect(() => {
    if (!hasAdminToken()) {
      goToLogin();
      return;
    }

    async function bootstrap(): Promise<void> {
      try {
        await loadDevices();
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, []);

  async function revoke(deviceId: string): Promise<void> {
    setRevokingDeviceId(deviceId);
    setError('');
    try {
      await revokeAdminDevice(deviceId);
      await loadDevices();
    } catch (err) {
      if (err instanceof DeviceBlockedError) {
        router.replace('/blocked');
        return;
      }
      if (err instanceof AdminUnauthorizedError) {
        goToLogin();
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to revoke device';
      setError(message);
    } finally {
      setRevokingDeviceId('');
    }
  }

  function signOut(): void {
    goToLogin();
  }

  const sortedDevices = useMemo(
    () =>
      [...devices].sort((left, right) => {
        const leftCreated = left.createdAt || left.expiresAt || '';
        const rightCreated = right.createdAt || right.expiresAt || '';
        return rightCreated.localeCompare(leftCreated);
      }),
    [devices]
  );

  return (
    <>
      <Head>
        <title>AWS Practice | Admin Devices</title>
      </Head>
      <main className="min-h-screen px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-6">
          <header className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-brand-600 dark:text-brand-500">Admin dashboard</p>
              <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">Device Management</h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Home
              </Link>
              <Link
                href="/admin"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Batches
              </Link>
              <Link
                href="/admin/questions"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Questions
              </Link>
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
            <section className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900 dark:bg-red-950 sm:p-5">
              <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Registered devices</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Device seeds are intentionally hidden.
                </p>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{sortedDevices.length} total</p>
            </div>

            {loading ? (
              <p className="text-sm text-slate-600 dark:text-slate-300">Loading devices...</p>
            ) : sortedDevices.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                No devices found.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left dark:border-slate-700">
                      <th className="px-3 py-2">Device ID</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Browser</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Expires</th>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">Updated</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDevices.map((device) => {
                      const expired = isExpiredDevice(device.expiresAt);
                      return (
                        <tr key={device.deviceId} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="max-w-[20rem] px-3 py-3 font-mono text-xs text-slate-700 dark:text-slate-200 sm:text-sm">
                            {device.deviceId}
                          </td>
                          <td className="max-w-[16rem] truncate px-3 py-3 text-slate-700 dark:text-slate-200" title={device.email || '-'}>
                            {device.email || '-'}
                          </td>
                          <td
                            className="max-w-[20rem] truncate px-3 py-3 text-slate-700 dark:text-slate-200"
                            title={device.userAgent || '-'}
                          >
                            {device.userAgent || '-'}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                expired
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                              }`}
                            >
                              {expired ? 'expired' : 'active'}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                            {formatClientDateTime(device.expiresAt)}
                          </td>
                          <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                            {formatClientDateTime(device.createdAt)}
                          </td>
                          <td className="px-3 py-3 text-slate-700 dark:text-slate-200">
                            {formatClientDateTime(device.updatedAt)}
                          </td>
                          <td className="px-3 py-3">
                            <button
                              onClick={() => revoke(device.deviceId)}
                              disabled={revokingDeviceId !== ''}
                              className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {revokingDeviceId === device.deviceId ? 'Revoking...' : 'Revoke'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
