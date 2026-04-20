import { apiUrl } from './api';
import { getValidIdToken } from './cognito-auth';
import { getOrRefreshDeviceSession, refreshDeviceSession } from './device-session';

export class DeviceBlockedError extends Error {
  constructor(message = 'Your device has been blocked.') {
    super(message);
    this.name = 'DeviceBlockedError';
  }
}

function withDefaultJsonContentType(init: RequestInit, headers: Headers): void {
  const isFormDataBody = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isFormDataBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
}

async function fetchWithDevice(path: string, init: RequestInit, refresh = false): Promise<Response> {
  const session = refresh ? await refreshDeviceSession() : await getOrRefreshDeviceSession();
  const idToken = await getValidIdToken();
  const headers = new Headers(init.headers);
  headers.set('X-Device-Id', session.deviceId);
  if (idToken) {
    headers.set('Authorization', `Bearer ${idToken}`);
  }
  withDefaultJsonContentType(init, headers);

  return fetch(apiUrl(path), {
    ...init,
    headers
  });
}

async function readDeviceRejectionMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return '';

  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string };
    return (parsed.message || parsed.error || '').trim();
  } catch {
    return text.trim();
  }
}

function isRevokedDeviceMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('device id is unknown') || normalized.includes('revoked');
}

export async function apiRequest(
  path: string,
  init: RequestInit = {},
  retryOnDeviceFailure = true
): Promise<Response> {
  const response = await fetchWithDevice(path, init, false);
  if (response.status !== 428 || !retryOnDeviceFailure) {
    return response;
  }

  const firstMessage = await readDeviceRejectionMessage(response.clone());
  if (isRevokedDeviceMessage(firstMessage)) {
    throw new DeviceBlockedError(firstMessage || 'Your device has been blocked.');
  }

  const retryResponse = await fetchWithDevice(path, init, true);
  if (retryResponse.status !== 428) {
    return retryResponse;
  }

  const retryMessage = await readDeviceRejectionMessage(retryResponse.clone());
  if (isRevokedDeviceMessage(retryMessage)) {
    throw new DeviceBlockedError(retryMessage || 'Your device has been blocked.');
  }

  return retryResponse;
}
