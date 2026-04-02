import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const base = process.env.BACKEND_API_BASE_URL || 'http://127.0.0.1:3000';
  const apiKey = process.env.ADMIN_API_KEY || '';
  const out = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(req.body)
  });
  if (!out.ok) return res.status(401).json({ ok: false });
  res.setHeader('Set-Cookie', `adminToken=${req.body.token}; Path=/; HttpOnly; SameSite=Lax`);
  return res.status(200).json({ ok: true });
}
