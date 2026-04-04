import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiUrl } from '../../lib/api';

export default function Admin() {
  const router = useRouter();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadBatches() {
    setError('');
    const res = await fetch(apiUrl('/api/admin/command'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list' })
    });

    if (res.status === 401) {
      router.replace('/admin/login');
      return;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Failed to load batches (${res.status})`);
    }

    const data = await res.json();
    setBatches(data.batches || []);
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        await loadBatches();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  async function generate() {
    await fetch(apiUrl('/api/admin/command'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate' })
    });
    await loadBatches();
  }

  async function mark(action: 'publish' | 'deprecate', batch: any) {
    await fetch(apiUrl('/api/admin/command'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, batchId: batch.batchId, level: batch.level, date: batch.date })
    });
    await loadBatches();
  }

  return (
    <main>
      <h1>Admin</h1>
      <button onClick={generate}>Trigger generation</button>
      {loading && <p>Loading batches...</p>}
      {error && <p>{error}</p>}
      <ul>
        {batches.map((b) => (
          <li key={b.batchId}>{b.level} - {b.date} - {b.status} <button onClick={() => mark('publish', b)}>Publish</button> <button onClick={() => mark('deprecate', b)}>Deprecate</button></li>
        ))}
      </ul>
    </main>
  );
}
