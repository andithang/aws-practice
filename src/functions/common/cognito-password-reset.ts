import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';

const cognito = new CognitoIdentityProviderClient({});

export class CognitoPasswordResetError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CognitoPasswordResetError';
    this.code = code;
  }
}

type ConfirmForgotPasswordInput = {
  email: string;
  code: string;
  newPassword: string;
};

function requireClientId(): string {
  const value = (process.env.COGNITO_USER_POOL_CLIENT_ID || '').trim();
  if (!value) {
    throw new Error('COGNITO_USER_POOL_CLIENT_ID is required');
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function mapCognitoResetError(error: unknown): CognitoPasswordResetError {
  const record = asRecord(error);
  const code = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'UnknownException';
  const message = typeof record.message === 'string' && record.message.trim()
    ? record.message.trim()
    : 'Password reset failed';
  return new CognitoPasswordResetError(code, message);
}

export async function startForgotPassword(email: string): Promise<void> {
  try {
    await cognito.send(new ForgotPasswordCommand({
      ClientId: requireClientId(),
      Username: email
    }));
  } catch (error) {
    throw mapCognitoResetError(error);
  }
}

export async function confirmForgotPassword(input: ConfirmForgotPasswordInput): Promise<void> {
  try {
    await cognito.send(new ConfirmForgotPasswordCommand({
      ClientId: requireClientId(),
      Username: input.email,
      ConfirmationCode: input.code,
      Password: input.newPassword
    }));
  } catch (error) {
    throw mapCognitoResetError(error);
  }
}
