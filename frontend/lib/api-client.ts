import { apiUrl } from './api';
import { getOrRefreshDeviceSession, refreshDeviceSession } from './device-session';

function withDefaultJsonContentType(init: RequestInit, headers: Headers): void {
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
}

async function fetchWithDevice(path: string, init: RequestInit, refresh = false): Promise<Response> {
  const session = refresh ? await refreshDeviceSession() : await getOrRefreshDeviceSession();
  const headers = new Headers(init.headers);
  headers.set('X-Device-Id', session.deviceId);
  withDefaultJsonContentType(init, headers);

  return fetch(apiUrl(path), {
    ...init,
    headers
  });
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

  return fetchWithDevice(path, init, true);
}

