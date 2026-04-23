type CognitoErrorPayload = {
  __type?: string;
  message?: string;
  Message?: string;
};

type CognitoSession = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAtEpochMs: number;
};

type JwtClaims = Record<string, unknown>;

type SignUpInput = {
  email: string;
  password: string;
  name: string;
};

type SignInInput = {
  email: string;
  password: string;
};

const storageKey = 'aws-practice-cognito-session';

export class CognitoAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CognitoAuthError';
    this.code = code;
  }
}

function requireEnv(name: 'NEXT_PUBLIC_COGNITO_REGION' | 'NEXT_PUBLIC_COGNITO_USER_POOL_ID' | 'NEXT_PUBLIC_COGNITO_CLIENT_ID'): string {
  const envValueByName = {
    NEXT_PUBLIC_COGNITO_REGION: process.env.NEXT_PUBLIC_COGNITO_REGION,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID,
    NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
  } as const;
  const value = (envValueByName[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function cognitoEndpoint(): string {
  const region = requireEnv('NEXT_PUBLIC_COGNITO_REGION');
  requireEnv('NEXT_PUBLIC_COGNITO_USER_POOL_ID');
  return `https://cognito-idp.${region}.amazonaws.com/`;
}

function clientId(): string {
  return requireEnv('NEXT_PUBLIC_COGNITO_CLIENT_ID');
}

function readStorage(): CognitoSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CognitoSession>;
    if (!parsed.idToken || !parsed.accessToken || !parsed.refreshToken || !parsed.expiresAtEpochMs) {
      return null;
    }

    return {
      idToken: parsed.idToken,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAtEpochMs: parsed.expiresAtEpochMs
    };
  } catch {
    return null;
  }
}

function writeStorage(session: CognitoSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(session));
}

function clearStorage(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey);
}

function decodeBase64Url(value: string): string | null {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

  if (typeof atob === 'function') {
    try {
      return atob(normalized);
    } catch {
      return null;
    }
  }

  try {
    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function parseJwtClaims(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;

  const payloadText = decodeBase64Url(parts[1]);
  if (!payloadText) return null;

  try {
    const parsed = JSON.parse(payloadText) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as JwtClaims;
  } catch {
    return null;
  }
}

function parseCognitoError(payload: CognitoErrorPayload): CognitoAuthError {
  const rawCode = payload.__type || 'UnknownException';
  const code = rawCode.includes('#') ? rawCode.split('#')[1] : rawCode;
  const message = payload.message || payload.Message || 'Authentication failed';
  if (code === 'LimitExceededException' || code === 'TooManyRequestsException') {
    return new CognitoAuthError(code, 'Email sending limit reached. Please try again later.');
  }
  return new CognitoAuthError(code, message);
}

async function callCognito(target: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(cognitoEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': target
    },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => ({}))) as CognitoErrorPayload & Record<string, unknown>;
  if (!response.ok) {
    throw parseCognitoError(payload);
  }

  return payload;
}

function parseAuthenticationResult(payload: Record<string, unknown>): CognitoSession {
  const auth = (payload.AuthenticationResult || {}) as Record<string, unknown>;
  const idToken = typeof auth.IdToken === 'string' ? auth.IdToken : '';
  const accessToken = typeof auth.AccessToken === 'string' ? auth.AccessToken : '';
  const refreshToken = typeof auth.RefreshToken === 'string' ? auth.RefreshToken : '';
  const expiresIn = typeof auth.ExpiresIn === 'number' ? auth.ExpiresIn : 3600;

  if (!idToken || !accessToken || !refreshToken) {
    throw new Error('Authentication result is missing tokens');
  }

  return {
    idToken,
    accessToken,
    refreshToken,
    expiresAtEpochMs: Date.now() + expiresIn * 1000
  };
}

export async function signUp(input: SignUpInput): Promise<{ requiresConfirmation: boolean }> {
  const response = await callCognito('AWSCognitoIdentityProviderService.SignUp', {
    ClientId: clientId(),
    Username: input.email.trim(),
    Password: input.password,
    UserAttributes: [
      { Name: 'email', Value: input.email.trim() },
      { Name: 'name', Value: input.name.trim() }
    ]
  });

  return {
    requiresConfirmation: !response.UserConfirmed
  };
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await callCognito('AWSCognitoIdentityProviderService.ConfirmSignUp', {
    ClientId: clientId(),
    Username: email.trim(),
    ConfirmationCode: code.trim()
  });
}

export async function resendConfirmationCode(email: string): Promise<void> {
  await callCognito('AWSCognitoIdentityProviderService.ResendConfirmationCode', {
    ClientId: clientId(),
    Username: email.trim()
  });
}

export async function signIn(input: SignInInput): Promise<void> {
  const response = await callCognito('AWSCognitoIdentityProviderService.InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId(),
    AuthParameters: {
      USERNAME: input.email.trim(),
      PASSWORD: input.password
    }
  });

  writeStorage(parseAuthenticationResult(response));
}

export async function refreshSession(): Promise<string | null> {
  const stored = readStorage();
  if (!stored?.refreshToken) return null;

  const response = await callCognito('AWSCognitoIdentityProviderService.InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: clientId(),
    AuthParameters: {
      REFRESH_TOKEN: stored.refreshToken
    }
  });

  const auth = (response.AuthenticationResult || {}) as Record<string, unknown>;
  const idToken = typeof auth.IdToken === 'string' ? auth.IdToken : '';
  const accessToken = typeof auth.AccessToken === 'string' ? auth.AccessToken : '';
  const expiresIn = typeof auth.ExpiresIn === 'number' ? auth.ExpiresIn : 3600;
  if (!idToken || !accessToken) {
    clearStorage();
    return null;
  }

  writeStorage({
    ...stored,
    idToken,
    accessToken,
    expiresAtEpochMs: Date.now() + expiresIn * 1000
  });

  return idToken;
}

export function signOut(): void {
  clearStorage();
}

export function hasStoredSession(): boolean {
  const stored = readStorage();
  if (!stored) return false;
  return stored.expiresAtEpochMs > Date.now();
}

export async function getValidIdToken(): Promise<string | null> {
  const stored = readStorage();
  if (!stored) return null;
  if (stored.expiresAtEpochMs > Date.now() + 30_000) {
    return stored.idToken;
  }

  try {
    return await refreshSession();
  } catch {
    clearStorage();
    return null;
  }
}

export async function getCurrentUserClaims(): Promise<JwtClaims | null> {
  const idToken = await getValidIdToken();
  if (!idToken) return null;
  return parseJwtClaims(idToken);
}

export function isAdminClaim(claims: JwtClaims | null): boolean {
  if (!claims) return false;
  const raw = claims['custom:is_admin'];
  if (typeof raw !== 'string') return false;
  return raw.trim().toLowerCase() === 'true';
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const claims = await getCurrentUserClaims();
  return isAdminClaim(claims);
}
