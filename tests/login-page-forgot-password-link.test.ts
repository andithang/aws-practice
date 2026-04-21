import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('login page links', () => {
  it('includes forgot-password navigation', () => {
    const content = readFileSync(join(process.cwd(), 'frontend/pages/login.tsx'), 'utf8');
    expect(content).toContain('href="/forgot-password"');
  });
});
