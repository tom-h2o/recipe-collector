import { test, expect, type Page, type Request } from '@playwright/test';
import { installMockBackend, MOCK_USER } from './support/mockBackend';
import { openSettings } from './support/nav';

/**
 * The Inbox and Settings → Connections, from the screen: accepting and
 * declining a recipe someone sent, and inviting, accepting and ending an
 * account connection.
 *
 * The rules themselves are tested where they are enforced: who may accept
 * what in api/share.test.ts, who may see whose recipes and that a link cannot
 * be forged in supabase/tests. What nothing covered was the path a person
 * takes: that the buttons send the right request and the screen follows the
 * answer. The tables here store rows, so the screen is checked against what a
 * reload would show, not only against its own optimistic state.
 */

const OTHER = 'b0000000-0000-4000-8000-0000000000b2';

interface Link {
  id: string; requester_id: string; requester_email: string; addressee_email: string; addressee_id: string | null;
  status: 'pending' | 'accepted'; requester_label: string | null; addressee_label: string | null; created_at: string; accepted_at: string | null;
}

function link(over: Partial<Link>): Link {
  return {
    id: 'c0000000-0000-4000-8000-000000000001', requester_id: OTHER, requester_email: 'anna@example.com',
    addressee_email: MOCK_USER.email, addressee_id: null, status: 'pending',
    requester_label: null, addressee_label: null, created_at: '2026-11-20T10:00:00Z', accepted_at: null, ...over,
  };
}

const SHARE = {
  id: 'd0000000-0000-4000-8000-000000000001', recipe_id: 'e0000000-0000-4000-8000-000000000001',
  recipe_title: 'Omas Apfelkuchen', recipe_description: 'Mit Zimt', recipe_image_url: null,
  sender_id: OTHER, sender_email: 'anna@example.com', recipient_email: MOCK_USER.email,
  status: 'pending', created_at: '2026-11-21T10:00:00Z',
};

/** Tables that remember: account_links, recipe_shares and the share endpoint. */
async function installPeople(page: Page, { links = [] as Link[], shares = [SHARE] } = {}) {
  const state = { links: [...links], shares: [...shares] };
  const sent = { share: [] as Record<string, unknown>[], inserts: [] as Record<string, unknown>[], rpc: [] as Record<string, unknown>[], deletes: [] as string[] };
  await installMockBackend(page);

  await page.route('**/rest/v1/account_links**', async (route) => {
    const req: Request = route.request();
    const url = new URL(req.url());
    if (req.method() === 'POST') {
      const row = req.postDataJSON() as Record<string, unknown>;
      sent.inserts.push(row);
      state.links.push(link({ id: `c0000000-0000-4000-8000-00000000000${state.links.length + 2}`, requester_id: MOCK_USER.id, requester_email: MOCK_USER.email, addressee_email: String(row.addressee_email) }));
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (req.method() === 'DELETE') {
      const id = (url.searchParams.get('id') ?? '').replace('eq.', '');
      sent.deletes.push(id);
      const gone = state.links.filter((l) => l.id === id);
      state.links = state.links.filter((l) => l.id !== id);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gone.map((l) => ({ id: l.id }))) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.links) });
  });

  await page.route('**/rest/v1/rpc/accept_account_link**', async (route) => {
    const args = route.request().postDataJSON() as { link_id: string };
    sent.rpc.push(args);
    state.links = state.links.map((l) => (l.id === args.link_id ? { ...l, status: 'accepted', addressee_id: MOCK_USER.id, accepted_at: '2026-11-28T10:00:00Z' } : l));
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/rest/v1/recipe_shares**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.shares) }));

  await page.route('**/api/share', async (route) => {
    const body = route.request().postDataJSON() as { action: string; shareId?: string };
    sent.share.push(body);
    state.shares = state.shares.filter((s) => s.id !== body.shareId);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.action === 'accept' ? { newRecipeId: 'f0000000-0000-4000-8000-000000000001' } : { ok: true }) });
  });

  return { state, sent };
}

async function openInbox(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Inbox/ }).click();
  await expect(page.getByRole('heading', { name: /Recipe Inbox/ })).toBeVisible();
}

async function openConnections(page: Page) {
  await page.goto('/');
  await openSettings(page);
  await page.getByRole('tab', { name: 'Connections' }).click();
  await expect(page.getByText('Connected accounts')).toBeVisible();
}

test.describe('the Inbox', () => {
  test('a recipe someone sent is added to the vault, and leaves the inbox', async ({ page }) => {
    const { sent } = await installPeople(page);
    await openInbox(page);

    await expect(page.getByText('Omas Apfelkuchen')).toBeVisible();
    await expect(page.getByText('anna@example.com')).toBeVisible();
    await page.getByRole('button', { name: 'Add to vault' }).click();

    await expect.poll(() => sent.share).toEqual([{ action: 'accept', shareId: SHARE.id }]);
    await expect(page.getByText('"Omas Apfelkuchen" added to your vault!')).toBeVisible();
    await expect(page.getByText('Your inbox is empty')).toBeVisible();
    // The tab's badge follows.
    await expect(page.getByRole('button', { name: /^Inbox/ })).toHaveText(/^Inbox$/);
  });

  test('declining a recipe removes it without adding anything', async ({ page }) => {
    const { sent } = await installPeople(page);
    await openInbox(page);

    await page.getByRole('button', { name: 'Decline' }).click();
    await expect.poll(() => sent.share).toEqual([{ action: 'reject', shareId: SHARE.id }]);
    await expect(page.getByText('Your inbox is empty')).toBeVisible();
  });

  test('a recipe that cannot be accepted stays, with the reason', async ({ page }) => {
    await installPeople(page);
    await page.route('**/api/share', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'This recipe is no longer available.' }) }));
    await openInbox(page);

    await page.getByRole('button', { name: 'Add to vault' }).click();
    await expect(page.getByText('This recipe is no longer available.')).toBeVisible();
    await expect(page.getByText('Omas Apfelkuchen')).toBeVisible();
  });

  test('a connection request is accepted through the database function, never by writing the row', async ({ page }) => {
    const invite = link({});
    const { sent } = await installPeople(page, { links: [invite], shares: [] });
    const writes: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/rest/v1/account_links') && ['PATCH', 'PUT'].includes(r.method())) writes.push(r.method()); });
    await openInbox(page);

    await expect(page.getByText('Connection request')).toBeVisible();
    await expect(page.getByText(/whole collection, not selected recipes/)).toBeVisible();
    await page.getByRole('button', { name: 'Connect', exact: true }).click();

    await expect.poll(() => sent.rpc).toEqual([{ link_id: invite.id }]);
    await expect(page.getByText('Connected — you can now see each other’s recipes.')).toBeVisible();
    await expect(page.getByText('Your inbox is empty')).toBeVisible();
    expect(writes).toEqual([]);
  });

  test('declining a connection request deletes the invitation', async ({ page }) => {
    const invite = link({});
    const { sent, state } = await installPeople(page, { links: [invite], shares: [] });
    await openInbox(page);

    await page.getByRole('button', { name: 'Decline' }).click();
    await expect.poll(() => sent.deletes).toEqual([invite.id]);
    await expect(page.getByText('Your inbox is empty')).toBeVisible();
    expect(state.links).toEqual([]);
  });

  test('has no "Back to Vault" link: the Vault tab is the way back', async ({ page }) => {
    await installPeople(page);
    await openInbox(page);
    await expect(page.getByText('Back to Vault')).toHaveCount(0);
    await expect(page.getByTitle('Back to Vault')).toHaveCount(0);

    await page.getByRole('button', { name: 'Add to vault' }).click();
    await expect(page.getByText('Your inbox is empty')).toBeVisible();
    await expect(page.getByText('Back to Vault')).toHaveCount(0);
  });
});

test.describe('Settings → Connections', () => {
  test('inviting someone sends a pending invitation from the person\'s own address, and it can be cancelled', async ({ page }) => {
    const { sent, state } = await installPeople(page, { shares: [] });
    await openConnections(page);
    await expect(page.getByText('No connections yet. Invite someone you cook with.')).toBeVisible();

    await page.getByLabel('Email address to connect with').fill('  Ben@Example.com ');
    await page.getByRole('button', { name: 'Invite' }).click();

    // Only who invites whom: status and the other person's id are not the
    // browser's to write (migration 0074).
    await expect.poll(() => sent.inserts).toEqual([{ requester_id: MOCK_USER.id, requester_email: MOCK_USER.email, addressee_email: 'ben@example.com' }]);
    await expect(page.getByText('Waiting for them to accept')).toBeVisible();
    await expect(page.getByText('ben@example.com').first()).toBeVisible();

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect.poll(() => state.links).toEqual([]);
    await expect(page.getByText('No connections yet. Invite someone you cook with.')).toBeVisible();
  });

  test('inviting your own address is refused before anything is sent', async ({ page }) => {
    const { sent } = await installPeople(page, { shares: [] });
    await openConnections(page);

    await page.getByLabel('Email address to connect with').fill(MOCK_USER.email.toUpperCase());
    await page.getByRole('button', { name: 'Invite' }).click();
    await expect(page.getByText('You cannot connect to yourself.')).toBeVisible();
    expect(sent.inserts).toEqual([]);
  });

  test('an invitation for you can be accepted here too, and then shows as connected', async ({ page }) => {
    const invite = link({});
    const { sent } = await installPeople(page, { links: [invite], shares: [] });
    await openConnections(page);

    await expect(page.getByText('Invitations for you')).toBeVisible();
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect.poll(() => sent.rpc).toEqual([{ link_id: invite.id }]);
    await expect(page.getByText('Invitations for you')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  });

  test('disconnecting ends the connection', async ({ page }) => {
    const accepted = link({ status: 'accepted', addressee_id: MOCK_USER.id, accepted_at: '2026-11-22T10:00:00Z' });
    const { sent, state } = await installPeople(page, { links: [accepted], shares: [] });
    await openConnections(page);

    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect.poll(() => sent.deletes).toEqual([accepted.id]);
    await expect(page.getByText('Disconnected')).toBeVisible();
    expect(state.links).toEqual([]);
  });

  test('a disconnect the database refuses says so and keeps the connection on screen', async ({ page }) => {
    // A delete the policy excludes matches no row and reports no error.
    const accepted = link({ status: 'accepted', addressee_id: MOCK_USER.id, accepted_at: '2026-11-22T10:00:00Z' });
    await installPeople(page, { links: [accepted], shares: [] });
    await page.route('**/rest/v1/account_links**', async (route) => {
      if (route.request().method() === 'DELETE') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.fallback();
    });
    await openConnections(page);

    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.getByText('Could not disconnect. Please reload and try again.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  });
});
