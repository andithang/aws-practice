import type { GetServerSideProps } from 'next';

type Props = { batches: any[] };

export default function Admin({ batches }: Props) {
  async function generate() {
    await fetch('/api/admin/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate' }) });
    location.reload();
  }

  async function mark(action: 'publish' | 'deprecate', batch: any) {
    await fetch('/api/admin/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, batchId: batch.batchId, level: batch.level, date: batch.date })
    });
    location.reload();
  }

  return (
    <main>
      <h1>Admin</h1>
      <button onClick={generate}>Trigger generation</button>
      <ul>
        {batches.map((b) => (
          <li key={b.batchId}>{b.level} - {b.date} - {b.status} <button onClick={() => mark('publish', b)}>Publish</button> <button onClick={() => mark('deprecate', b)}>Deprecate</button></li>
        ))}
      </ul>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req }) => {
  const token = req.headers.cookie?.split(';').find((c) => c.trim().startsWith('adminToken='))?.split('=')[1];
  if (!token) return { redirect: { destination: '/admin/login', permanent: false } };

  const base = process.env.BACKEND_API_BASE_URL || 'http://127.0.0.1:3000';
  const apiKey = process.env.ADMIN_API_KEY || '';
  const res = await fetch(`${base}/api/admin/batches`, { headers: { 'x-api-key': apiKey, Authorization: `Bearer ${token}` } });
  if (res.status === 401) return { redirect: { destination: '/admin/login', permanent: false } };
  const data = await res.json();
  return { props: { batches: data.batches || [] } };
};
