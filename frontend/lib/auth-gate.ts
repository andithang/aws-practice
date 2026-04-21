import { CognitoAuthError } from './cognito-auth';

type VerifyRoute = {
  pathname: '/verify';
  query: {
    email: string;
    required: '1';
  };
};

export function isUnverifiedUserError(error: unknown): boolean {
  return error instanceof CognitoAuthError && error.code === 'UserNotConfirmedException';
}

export function buildVerifyRequiredRoute(email: string): VerifyRoute {
  return {
    pathname: '/verify',
    query: {
      email: email.trim(),
      required: '1'
    }
  };
}

export function mustShowVerificationRequired(value: string | string[] | undefined): boolean {
  return typeof value === 'string' && value === '1';
}
