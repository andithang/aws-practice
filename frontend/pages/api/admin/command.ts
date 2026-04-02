import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.headers.cookie?.split(';').find((c) => c.trim().startsWith('adminToken='))?.split('=')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  const { action, batchId, level, date } = req.body;
  const base = process.env.BACKEND_API_BASE_URL || 'http://127.0.0.1:3000';
  const apiKey = process.env.ADMIN_API_KEY || '';

  let path = '/api/admin/generate';
  let body: any = {};

  if (action === 'publish') {
    path = `/api/admin/batches/${batchId}/publish`;
    body = { level, date };
  }
  if (action === 'deprecate') {
    path = `/api/admin/batches/${batchId}/deprecate`;
    body = { level, date };
  }

  const out = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const data = await out.json();
  return res.status(out.status).json(data);
}
