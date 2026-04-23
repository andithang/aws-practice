import { isCurrentUserAdmin, signOut } from './cognito-auth';

export type AdminGateDecision = 'allow' | 'redirect-login';

export async function ensureAdminSession(): Promise<AdminGateDecision> {
  const isAdmin = await isCurrentUserAdmin();
  if (isAdmin) return 'allow';

  signOut();
  return 'redirect-login';
}
