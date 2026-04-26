const hiddenRoutePrefixes = ['/login', '/signup', '/verify', '/forgot-password', '/reset-password'];

export function shouldHideNotebook(pathname: string): boolean {
  return hiddenRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
