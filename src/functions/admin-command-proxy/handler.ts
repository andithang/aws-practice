import { APIGatewayProxyHandler } from 'aws-lambda';
import { json } from '../common/http';

const backendBaseUrl = (process.env.BACKEND_API_BASE_URL || '').replace(/\/$/, '');
const adminApiKey = process.env.ADMIN_API_KEY || '';

function readCookie(headers: Record<string, string | undefined>, key: string): string {
  const raw = headers.cookie || headers.Cookie || '';
  const cookie = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`));

  if (!cookie) return '';
  try {
    return decodeURIComponent(cookie.slice(key.length + 1));
  } catch {
    return '';
  }
}

function parseBody(body: string | null): Record<string, unknown> {
  try {
    return JSON.parse(body || '{}');
  } catch {
    return {};
  }
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (!backendBaseUrl || !adminApiKey) {
    return json(500, { message: 'Proxy is not configured' });
  }

  const token = readCookie(event.headers || {}, 'adminToken');
  if (!token) {
    return json(401, { message: 'Unauthorized' });
  }

  const body = parseBody(event.body);
  const action = typeof body.action === 'string' ? body.action : '';

  let path = '/api/admin/generate';
  let method: 'GET' | 'POST' = 'POST';
  let payload: Record<string, unknown> = {};

  if (action === 'list') {
    path = '/api/admin/batches';
    method = 'GET';
  } else if (action === 'publish' || action === 'deprecate') {
    const batchId = typeof body.batchId === 'string' ? body.batchId : '';
    const level = typeof body.level === 'string' ? body.level : '';
    const date = typeof body.date === 'string' ? body.date : '';

    if (!batchId || !level || !date) {
      return json(400, { message: 'batchId, level and date are required' });
    }

    path = `/api/admin/batches/${batchId}/${action}`;
    payload = { level, date };
  } else if (action !== 'generate') {
    return json(400, { message: 'Unsupported action' });
  }

  const headers: Record<string, string> = {
    'x-api-key': adminApiKey,
    Authorization: `Bearer ${token}`
  };
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const out = await fetch(`${backendBaseUrl}${path}`, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(payload) : undefined
    });

    const responseText = await out.text();
    let responsePayload: unknown = {};
    if (responseText) {
      try {
        responsePayload = JSON.parse(responseText);
      } catch {
        responsePayload = { message: responseText };
      }
    }

    return json(out.status, responsePayload);
  } catch {
    return json(502, { message: 'Upstream request failed' });
  }
};
