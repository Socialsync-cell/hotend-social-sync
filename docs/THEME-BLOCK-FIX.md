# Theme block deployment repair — 22 September 2026

## Findings

The supplied archive already contains a `Social gallery` theme app extension at
`extensions/social-gallery`. Its Liquid block targets `section`, so it belongs in
the theme editor's app-block picker rather than the App embeds panel.

The supplied app configuration had a placeholder Shopify Client ID and example
application/callback URLs. The original validation notes did not record a
completed Shopify extension deployment. This is consistent with a backend
deployed to Render without the extension being released to Shopify; the archive
alone cannot confirm the state of the current Shopify app or theme.

## Changes

- Updated `shopify.app.toml` to use the known Render application origin and
  Shopify OAuth callback. The Client ID remains a placeholder until the owner
  supplies the ID of the existing installed Shopify app.
- Added `scripts/prepare-theme-deploy.mjs`. It checks the Client ID format,
  rejects numeric Meta App IDs, and prepares `shopify.app.gallery.toml` without
  changing the original config. Existing generated configs receive a backup.
- Added `deploy-theme-block.cmd` to prepare the configuration, run Shopify CLI
  validation, and launch an interactive deployment with that named config.
- Added `START-HERE.md` and linked it from the README and setup guide.
- Added four tests for deployment configuration generation and input handling.

The gallery and backend implementation are unchanged. The helper does not alter
the Render service or request app secrets. Shopify deployment will publish the
configuration and extension after the owner reviews the CLI release summary.

## Checks completed

| Check | Result |
| --- | --- |
| `npm run check` | Passed JavaScript syntax checks. |
| `node --check scripts/prepare-theme-deploy.mjs` | Passed. |
| `npm test` | 22 tests passed; zero failures, including the 18 original tests. |
| Shopify Liquid skill validator | All five extension files passed: Liquid block, CSS, JavaScript and both locale files. |
| Deployment helper integration check | Passed in a temporary directory: generated TOML parsed correctly, original config preserved, repeat-run backup matched, invalid ID caused no writes, and invocation worked from another directory. |
| Installed Shopify CLI help | Confirmed `app deploy --config gallery` selects the named configuration and releases by default. |

The extension validator could not fetch the latest documentation through the
network proxy and used its bundled Shopify schema/documentation fallback. It
reported `VALID` with successful checks for all five files.

## Checks requiring the owner's environment

`shopify app config validate --json` was attempted using the actual Shopify CLI.
It exited before validation because the connection to
`accounts.shopify.com/oauth/device_authorization` timed out through the network
proxy. Authenticated configuration validation is therefore **not complete**.
The launcher repeats it with the owner's real Client ID and stops on failure.

No Shopify version was deployed or released during this repair, and no live theme
was changed. The actual installed app, released extension and storefront behavior
still need to be verified using the steps in `START-HERE.md`.

The Windows launcher was inspected but not executed in Windows; the underlying
Node helper was executed and checked on Node.js 24.19.0 in Linux. No demo Client
ID or generated deployment configuration is included in the deliverable.

Keep Shopify-generated extension UIDs and the real named configuration for later
releases so the same extension and app are updated consistently.
