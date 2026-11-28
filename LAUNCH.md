# Launch checklist

For sharing Speisekammer with the first invited people. Work from top to
bottom; part 5 is the one to repeat before every wider round.

`<app>` below is the address the app is served from: your own domain once
part 2 is done (for example `speisekammer.040labs.de`), until then the
production domain in Vercel.

## 1. After the deploy

- [ ] The `migrate-production` job in GitHub Actions is green. This release
      needs migrations 0076 (search), 0077 (shopping list) and 0078 (feedback).
      Until they have run, search shows "The recipes could not be loaded",
      Generate on the shopping list fails and feedback cannot be sent.
- [ ] Admin → System → **Run check**: the schema line says 0078, and every
      Claude model answers. This is the only live test of the Claude models.
- [ ] `VITE_SIGNUP_OPEN` is **not** set in Vercel (Production). Unset means
      invitation only.
- [ ] After migration 0080 (search in German and English): Admin → System →
      **Add search words**, once. It gives the recipes saved before that
      release their German and English search words, one small AI call per
      recipe, and can be stopped and continued. New recipes get them when
      they are tagged.

## 2. Move to your own domain

Do this before inviting anyone: installed apps, Shortcuts and share links are
tied to the address people first used. Nothing in the code holds the address,
so this is settings only.

A subdomain (for example `speisekammer.040labs.de`) keeps the domain itself
free for other things, and its DNS record does not touch the domain's mail
records.

**Vercel**

- [ ] Project → Settings → Domains → add the new address.
- [ ] Add the DNS record Vercel shows (a CNAME for a subdomain) at your domain
      provider, and wait until Vercel shows the domain as valid. The
      certificate is issued automatically.
- [ ] Keep the old `…vercel.app` address in the list. Links already sent and
      apps already installed keep working through it.
- [ ] If `ALLOWED_ORIGIN` is set (Settings → Environment Variables), **Edit**
      it to `https://<app>` and redeploy. It decides which address link
      previews of shared recipes point to. It does not block anyone: people
      still on the old address are not affected. If it is not set, leave it.

**Supabase** (Authentication → URL Configuration; also in part 3)

- [ ] Site URL: `https://<app>`. Invitation, magic-link and reset emails send
      people there.
- [ ] Redirect URLs: add `https://<app>`, and leave the old address in for as
      long as anyone uses it, or a magic link or reset requested from the old
      address does not come back to it.

**Your own devices**

- [ ] Home Screen app: remove it and add it again from the new address. You
      sign in again, and what is kept on the device (theme, which release
      notes you have seen) starts fresh. Recipes are in the database and are
      not affected.
- [ ] iPhone Shortcuts: both hold the old address in their *Get Contents of
      URL* step. Open the app on the new address, Settings → General → iPhone
      Shortcuts shows the address to use, and change it in both.
- [ ] If the Shortcuts were already shared by iCloud link: share the changed
      ones again and paste the new links into the same place in Settings.

**Check**

- [ ] Open `https://<app>`, sign in, and request a magic link: it lands on the
      new address.
- [ ] Admin → System → Run check.

## 3. Supabase switches

Supabase dashboard → Authentication.

- [ ] **Sign In / Providers → Allow new users to sign up: off.** This is what
      actually keeps strangers out; the app only hides the sign-up links.
- [ ] **URL Configuration → Site URL** is `https://<app>`, and the same address
      is in **Redirect URLs**. Invitation, magic-link and reset emails send
      people there. If it still says `localhost`, every email link is dead.
- [ ] **Sign In / Providers → Email → Confirm email: on** (the admin check and
      recipe sharing only trust a confirmed address).

## 4. Sign-in emails through your own domain

Supabase's built-in mailer sends about two emails an hour and is meant for
testing; do this before inviting anyone. Either of two ways: your existing
iCloud mailbox on the domain (enough for the first few people, no DNS
changes), or Resend (the one to move to when the app opens up). Switching
later is only a change of the SMTP fields.

**With iCloud Mail on your domain**

- [ ] In iCloud Mail settings → Custom Email Domain, add the address the mail
      comes from, e.g. `speisekammer@<your-domain>`. Replies arrive there.
- [ ] account.apple.com → Sign-In and Security → App-Specific Passwords: make
      one for Supabase. Changing the Apple Account password revokes it, and
      sign-in emails then fail until a new one is entered.
- [ ] Supabase → Authentication → Emails → **SMTP Settings** → enable custom
      SMTP: host `smtp.mail.me.com`, port `587`, username your iCloud Mail
      address (if that is refused, the custom-domain address), password the
      app-specific password, sender the address from the first step, sender
      name `Speisekammer`. These settings were not tested from this
      repository; the invitation in part 5 is the test.

**With Resend**

- [ ] Create an account at resend.com and add your domain, best as a subdomain
      such as `mail.<your-domain>`.
- [ ] Add the DNS records Resend shows (SPF, DKIM) at your domain provider and
      wait until Resend says **Verified**.
- [ ] Create an API key in Resend.
- [ ] Supabase → Authentication → Emails → **SMTP Settings** → enable custom
      SMTP: host `smtp.resend.com`, port `465`, user `resend`, password the
      API key, sender e.g. `speisekammer@mail.<your-domain>`, sender name
      `Speisekammer`.

**Either way**

- [ ] Supabase → Authentication → **Rate Limits**: emails per hour to 30.
- [ ] Supabase → Authentication → Emails → **Templates**: replace the default
      wording of *Invite user*, *Magic Link* and *Reset Password*. They are
      stored in Supabase, not in this repository. Suggested texts (the people
      invited read German; the link variable must stay exactly as written):

  **Invite user** — subject: `Einladung zu Speisekammer`

  ```html
  <h2>Du bist eingeladen</h2>
  <p>Speisekammer ist eine Rezeptsammlung für Familie und Freunde.
     Mit diesem Link legst du dein Konto an und wählst ein Passwort:</p>
  <p><a href="{{ .ConfirmationURL }}">Einladung annehmen</a></p>
  <p>Der Link gilt 24 Stunden und nur einmal. Rezepte, Fotos und Seiten, die du
     hinzufügst, werden zum Lesen an Anthropic und Google gesendet; mehr dazu
     unter „What happens to your data“ auf der Anmeldeseite.</p>
  ```

  **Magic Link** — subject: `Dein Anmeldelink für Speisekammer`

  ```html
  <p>Mit diesem Link meldest du dich bei Speisekammer an:</p>
  <p><a href="{{ .ConfirmationURL }}">Anmelden</a></p>
  <p>Wenn du das nicht warst, kannst du diese E-Mail ignorieren.</p>
  ```

  **Reset Password** — subject: `Neues Passwort für Speisekammer`

  ```html
  <p>Mit diesem Link wählst du ein neues Passwort:</p>
  <p><a href="{{ .ConfirmationURL }}">Neues Passwort wählen</a></p>
  <p>Wenn du das nicht warst, kannst du diese E-Mail ignorieren.</p>
  ```

## 5. Run-through with a second account (about 15 minutes, on an iPhone)

Use an address that is not the admin's.

**Getting in**

- [ ] Supabase → Authentication → Users → **Invite user** with the second
      address. The email arrives within a minute, from your own sender.
- [ ] The link opens "Welcome to Speisekammer" and asks for a password, then
      shows the empty vault. (If it opens the vault directly, tell Claude: the
      invitation link then arrives in a form the app does not recognise.)
- [ ] Sign out, sign in again with the password.
- [ ] On the sign-in screen: no "Sign up", and the line about Anthropic and
      Google with its link to `/about`.
- [ ] Magic Link with an address that has **no** account: an error about
      invitation only, and no new user in Supabase.
- [ ] "Forgot password?" sends a reset email, and its link opens "Set New
      Password".

**Recipes**

- [ ] Add a recipe from a link, one from a photo of a cookbook page, one from
      pasted text. Each gets tags and nutrition within about half a minute.
- [ ] Search: a half-typed word, two words, a word inside a longer word
      ("Suppe" for a "…suppe"), a tag.
- [ ] Settings → General → iPhone Shortcuts: make a key, add both Shortcuts,
      send a photo from Photos and a page from Safari. The banner in the vault
      announces them.

**Cooking**

- [ ] Add the app to the Home Screen and open it from there.
- [ ] Open a recipe → Cook. Leave the phone alone for longer than its
      auto-lock time: **the screen stays on.** Check this in the installed app,
      not only in Safari. In Low Power Mode iOS may refuse; that is expected.
- [ ] Start a timer from a step, lock the phone by hand, unlock: the timer
      shows the right remaining time.

**Planning and shopping**

- [ ] Plan two meals, Shopping → Generate. Add an item by hand ("Kaffee"),
      Generate again: the item is still there, under "Your items".

**Sharing and the rest**

- [ ] Send a recipe to the admin's address; accept it there.
- [ ] Create a public link for a recipe and open it in a private window: the
      recipe shows, and nothing asks a stranger to create an account.
- [ ] Account menu → Send feedback. As the admin: Admin → Feedback shows it
      with a "1" on the tab; set it to Done.
- [ ] Account menu → Delete account. In Supabase the user is gone, and so are
      their recipes and the feedback they sent.

## 6. Known and accepted for this round

- **No backups.** A free Supabase project has none, and pauses after a week
  without use. Account menu → Export recipes (JSON) gives each person a copy
  of their own recipes; photo files are not in it.
- **No total cost ceiling.** Each person has 100 AI calls a day. A monthly
  spend limit can be set in the Claude Console; when it is reached, calls fall
  back to Gemini.
- **The interface is English.** German and English is the first job after
  launch.
- **No Impressum or privacy policy**, only the data note on `/about`. Both are
  due before sign-up is opened (`VITE_SIGNUP_OPEN=true`).

## Opening sign-up later

1. Impressum and privacy policy are in the app.
2. Supabase: "Allow new users to sign up" on.
3. Vercel: `VITE_SIGNUP_OPEN=true` for Production, then redeploy (the value is
   compiled into the app).
