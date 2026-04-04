let adminToken = '';

export function setAdminToken(token: string): void {
  adminToken = token.trim();
}

export function getAdminToken(): string {
  return adminToken;
}

export function hasAdminToken(): boolean {
  return adminToken.length > 0;
}

export function clearAdminToken(): void {
  adminToken = '';
}
