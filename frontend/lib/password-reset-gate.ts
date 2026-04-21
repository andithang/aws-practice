type PostResetLoginRoute = {
  pathname: '/login';
  query: {
    reset: '1';
  };
};

export function buildPostResetLoginRoute(): PostResetLoginRoute {
  return {
    pathname: '/login',
    query: {
      reset: '1'
    }
  };
}

export function mustShowPasswordResetSuccess(value: string | string[] | undefined): boolean {
  return typeof value === 'string' && value === '1';
}
