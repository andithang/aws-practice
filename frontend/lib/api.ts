const rawApiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();

function normalizeApiBase(value: string): string {
  if (!value) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is required and must point to your AWS API Gateway endpoint.'
    );
  }

  if (!/^https?:\/\//i.test(value)) {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL must be an absolute http(s) URL (for example: https://xxxx.execute-api.ap-southeast-1.amazonaws.com/prod).'
    );
  }

  return value.replace(/\/$/, '');
}

const apiBase = normalizeApiBase(rawApiBase);

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${apiBase}${normalized}`;
}
