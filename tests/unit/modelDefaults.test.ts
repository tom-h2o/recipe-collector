import { describe, it, expect } from 'vitest';
import { DEFAULT_MODEL as CLIENT_DEFAULT } from '../../src/lib/constants';
import { DEFAULT_MODEL as SERVER_DEFAULT } from '../../api/_lib/supabase';

/**
 * The frontend seeds settings with its own default while the API falls back to
 * its own. If the two drift, a user with no saved settings row sees one model
 * in the UI while a different one does the work.
 *
 * Lives here rather than under src/ because api/_lib/supabase.ts uses `process`,
 * which is not typed in the browser-facing tsconfig.
 */
describe('default Gemini model', () => {
  it('is identical on the client and the server', () => {
    expect(SERVER_DEFAULT).toBe(CLIENT_DEFAULT);
  });

  it('is a concrete pinned id, not an auto-updating alias', () => {
    expect(CLIENT_DEFAULT).toMatch(/^gemini-\d/);
    expect(CLIENT_DEFAULT).not.toMatch(/-latest$/);
  });
});
