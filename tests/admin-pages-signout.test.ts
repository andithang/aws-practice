import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const adminPages = [
  'frontend/pages/admin/index.tsx',
  'frontend/pages/admin/questions.tsx',
  'frontend/pages/admin/devices.tsx'
];

describe('admin page sign out wiring', () => {
  it.each(adminPages)('%s uses shared auth signout and non-recursive click handler', (relativePath) => {
    const content = readFileSync(join(process.cwd(), relativePath), 'utf8');

    expect(content).toContain("import { signOut as clearSession } from '../../lib/cognito-auth';");
    expect(content).toContain('function handleSignOut');
    expect(content).toContain('onClick={handleSignOut}');
    expect(content).toContain('clearSession();');
    expect(content).not.toContain('function signOut');
  });
});
