# Liquid glass: before and after

The same six screens taken from the commit before the glass design (`551a6e7`)
and from the commit that merged the iPhone fixes on top of it (`797903c`,
PR #66; the glass itself came in PR #65). Each file holds the pair: "Before"
first, "After" second.

| File | Screen |
| --- | --- |
| `phone-vault-light.png`, `phone-vault-dark.png` | Recipe vault at 390 x 844, scrolled so a photo sits under the header and the tab bar |
| `phone-recipe-light.png`, `phone-recipe-dark.png` | A recipe open at 390 x 844 (the close button on the photo) |
| `desktop-menu-light.png`, `desktop-menu-dark.png` | Vault at 1280 x 800 with the account menu open |

What to look for:

- The phone tab bar floats as a glass capsule, with a pill under the current
  tab, and lets the content show through, blurred.
- The header is glass too, but denser, so a photo scrolling underneath stays a
  tint rather than a smear behind its buttons.
- Each recipe card has a fine edge and a resting shadow, with more room between
  cards, so it is clear where one recipe ends and the next begins.
- The star and close buttons on photos are glass; so is the account menu.

The iPhone fix in PR #66 (nothing tappable under the status bar or the home
indicator) does not show here: these are taken without a phone's insets.

## How they were taken

- Against the mocked backend the browser tests use (`tests/e2e/support/mockBackend.ts`),
  so the account is `test@example.com` and the two recipes are the test fixtures.
  The photos are generated blobs of colour, not real dishes.
- At `deviceScaleFactor: 1`. The Chromium these were taken in renders through
  SwiftShader, which at 2x blurs only the upper part of a `backdrop-filter` box
  (see the glass note in `CLAUDE.md`). A real phone screen will look sharper.
- Not taken on a real iPhone. Safari draws blur and shadows a little differently.
