import { APIGatewayProxyHandler } from 'aws-lambda';
import { json } from '../common/http';

const backendBaseUrl = (process.env.BACKEND_API_BASE_URL || '').replace(/\/$/, '');
const adminApiKey = process.env.ADMIN_API_KEY || '';

export const handler: APIGatewayProxyHandler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!token) {
    return json(400, { ok: false, message: 'Token is required' });
  }

  if (!backendBaseUrl || !adminApiKey) {
    return json(500, { ok: false, message: 'Proxy is not configured' });
  }

  try {
    const out = await fetch(`${backendBaseUrl}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': adminApiKey
      },
      body: JSON.stringify({ token })
    });

    if (!out.ok) {
      return json(401, { ok: false });
    }
  } catch {
    return json(502, { ok: false, message: 'Upstream request failed' });
  }

  const cookie = `adminToken=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None`;
  return json(200, { ok: true }, { 'Set-Cookie': cookie });
};
