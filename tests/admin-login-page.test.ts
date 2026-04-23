import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('admin login page', () => {
  it('uses admin session guard and redirects to standard login', () => {
    const content = readFileSync(join(process.cwd(), 'frontend/pages/admin/login.tsx'), 'utf8');
    expect(content).toContain('ensureAdminSession');
    expect(content).toContain("router.replace('/login')");
    expect(content).not.toContain('Admin token');
  });
});
