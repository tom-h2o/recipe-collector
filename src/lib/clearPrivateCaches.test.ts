import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearPrivateCaches, PRIVATE_CACHES } from './clearPrivateCaches';

describe('clearPrivateCaches', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('deletes every cache that holds a person\'s data', async () => {
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', { delete: del });
    await clearPrivateCaches();
    expect(del.mock.calls.map((c) => c[0]).sort()).toEqual([...PRIVATE_CACHES].sort());
  });

  it('never throws, so signing out cannot fail on it', async () => {
    vi.stubGlobal('caches', { delete: vi.fn().mockRejectedValue(new Error('SecurityError')) });
    await expect(clearPrivateCaches()).resolves.toBeUndefined();
  });

  it('names the caches the service worker really writes', () => {
    // A renamed cache in vite.config.ts would otherwise survive sign-out unnoticed.
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    for (const name of PRIVATE_CACHES) expect(config).toContain(`cacheName: '${name}'`);
  });
});
