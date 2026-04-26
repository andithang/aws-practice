import { describe, expect, it } from 'vitest';
import { shouldHideNotebook } from '../frontend/lib/notebook-shell-routes';

describe('notebook shell visibility', () => {
  it('hides notebook on auth pages', () => {
    expect(shouldHideNotebook('/login')).toBe(true);
    expect(shouldHideNotebook('/signup')).toBe(true);
    expect(shouldHideNotebook('/verify')).toBe(true);
    expect(shouldHideNotebook('/forgot-password')).toBe(true);
    expect(shouldHideNotebook('/reset-password')).toBe(true);
  });

  it('shows notebook on authenticated app pages', () => {
    expect(shouldHideNotebook('/')).toBe(false);
    expect(shouldHideNotebook('/levels')).toBe(false);
    expect(shouldHideNotebook('/practice')).toBe(false);
    expect(shouldHideNotebook('/admin/questions')).toBe(false);
  });
});
