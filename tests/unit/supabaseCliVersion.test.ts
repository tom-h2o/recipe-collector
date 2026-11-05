import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Two CI jobs reach for the Supabase CLI by different routes: the `rls` job via
 * supabase/setup-cli, and `migrate-production` via `npx supabase`, which
 * resolves the devDependency. If they land on different majors, one of them
 * breaks — and the failure appears on whatever pull request happens to run
 * next, nowhere near its cause.
 *
 * That is not hypothetical. `version: latest` picked up CLI 3.0, which renamed
 * [inbucket] to [local_smtp]; pinning only the workflow to 3.0.0 then broke the
 * migration job, which was still on 2.x and rejects the new key.
 */
const root = process.cwd();

function workflowVersion(): string {
  const yml = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const m = yml.match(/supabase\/setup-cli@v1[\s\S]*?version:\s*([0-9][^\s#]*)/);
  if (!m) throw new Error('setup-cli version not found, or not pinned to a concrete version');
  return m[1];
}

function devDependencyRange(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const range = pkg.devDependencies?.supabase ?? pkg.dependencies?.supabase;
  if (!range) throw new Error('no supabase dependency found');
  return range;
}

const major = (v: string) => v.replace(/^[^0-9]*/, '').split('.')[0];

describe('the Supabase CLI version is agreed across CI', () => {
  it('is pinned in the workflow, never `latest`', () => {
    expect(workflowVersion()).toMatch(/^\d+\.\d+/);
  });

  it('matches the major of the devDependency npx resolves', () => {
    expect(major(workflowVersion())).toBe(major(devDependencyRange()));
  });
});

describe('config.toml matches that major', () => {
  it('uses the key name the pinned CLI expects', () => {
    const toml = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8');
    const m = Number(major(workflowVersion()));
    if (m >= 3) {
      expect(toml, 'CLI 3+ expects [local_smtp]').toMatch(/^\[local_smtp\]/m);
      expect(toml).not.toMatch(/^\[inbucket\]/m);
    } else {
      expect(toml, 'CLI 2.x expects [inbucket]').toMatch(/^\[inbucket\]/m);
      expect(toml).not.toMatch(/^\[local_smtp\]/m);
    }
  });
});
