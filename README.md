> **Mobile carousel update:** Start with [CAROUSEL-UPDATE.md](CAROUSEL-UPDATE.md) and run **update-gallery-carousel.cmd**. This ZIP now includes your existing deployed app and extension identifiers; no Client ID setup is needed for this update. Earlier setup instructions below are retained for reference.

# Hotend Social Sync

**Gallery missing from the theme editor?** Read [START-HERE.md](START-HERE.md).
The `Social gallery` extension is included. On Windows, `deploy-theme-block.cmd`
prepares the existing Shopify app configuration, validates it and opens Shopify's
deployment flow. This Shopify release is separate from hosting the server on Render.

A working development release of a single-store Shopify app for a customer photo and comment gallery. Includes the server, management dashboard, Instagram/Facebook connector, Shopify theme app extension, automated tests and deployment files.

**Status:** implemented and locally tested. Not installed on a Shopify store, hosted publicly, connected to real Meta accounts, or approved by Meta. Live API behavior and granted permissions must be checked with your accounts before launch. This ZIP is app source code; it is **not a Shopify theme ZIP** and cannot be installed through “Upload theme”.

## Try the app on your computer

1. Install **Node.js 24 LTS** from [nodejs.org](https://nodejs.org/en/download).
2. Extract the ZIP.
3. On Windows, double-click `start-demo.cmd`. On macOS/Linux, open a terminal in the extracted folder and run `npm run demo`.
4. Open **http://localhost:3000**.

There are no npm runtime packages to install. The demo saves sample data in `data/demo`. It is available only on your computer, cannot connect real accounts and cannot run in production mode. All sample posts and illustrations are labelled. Start with a fresh demo by stopping the app and deleting **only** `data/demo`.

## What is included

| Feature | Behavior |
| --- | --- |
| Instagram | Imports accessible media tagging the connected professional account, and top-level comments on its recent media. |
| Facebook | Imports accessible visitor posts in the connected Page feed and comments on recent Page feed posts. Business-authored posts/comments are excluded when author identity is available. |
| Scheduled sync | Every 15 minutes by default, plus a manual sync button. |
| Automatic publishing | Enabled by default for newly imported items. Turn it off for review before publication. |
| Moderation | Publish, move to pending, hide and restore individual items. Hidden items stay hidden on reimport. |
| Product matching | Assign a Shopify product handle to an item and enable matching in the gallery block. |
| Storefront | Responsive app block with heading, platform, column and item-count settings. |
| Gallery pause | Stops public display without removing collected content. |
| Account management | Shopify login, Meta OAuth, Page selection, reconnect and disconnect with erasure. |
| Activity | Sync results and actionable connection/permission errors. |
| Data protection | Encrypted Meta tokens, browser-bound OAuth state, CSRF protection, verified Shopify proxy requests and signed deletion webhooks. |

Automatic publishing applies to **new** content. Changing the setting does not retroactively publish pending/hidden items. In review mode, a changed caption or author on a published item sends it back to pending. Image URL refreshes alone do not do this because Meta URLs change routinely.

## Deliberate first-version limits

- One allowlisted Shopify store, one Facebook Page and that Page’s linked Instagram Business/Creator account. This is a standalone app, not embedded inside the Shopify Admin iframe.
- No private-profile access, DMs, Stories, hashtag discovery, arbitrary social search, caption-only mention ingestion, Facebook reviews/ratings import, or Instagram comment-reply traversal. A tag does not guarantee that Meta exposes a particular post.
- Polling, not instant social webhooks. Each run discovers up to 75 tagged Instagram media items, 25 recent Instagram media items with up to 25 comments each, and 25 Facebook feed posts with up to 25 comments each. These are requested API page limits; actual results depend on Meta. New comments on older posts outside those windows can be missed.
- Up to 100 existing published items are revalidated per run, prioritizing the least recently seen. Runs are capped at 180 API requests. Failures retry at the next interval. Source content that cannot be verified for 48 hours is withheld from the gallery; permanent unavailable-object responses hide it sooner. Deletion handling is not instantaneous.
- Gallery output is limited to 48 items per request; the block exposes up to 24. The dashboard loads the latest 500 items. There is no historical backfill, multi-store support or high-volume queue worker in this release.
- Carousel posts use their returned cover image. Videos use a thumbnail when supplied, not an embedded video player. Original links are retained. Instagram comment links lead to the parent post.
- No Shopify customer/order data is requested. Social identities are not matched to Shopify customers or treated as verified purchasers.
- Product association is manual by handle. This app does not infer which filament or other product appears in a customer image.
- Single Node process with a persistent SQLite volume. Not suitable for ephemeral storage, multiple replicas or serverless request-only hosting without architectural changes.

## Make it live

Follow [docs/SETUP.md](docs/SETUP.md). You need a Shopify app registration, a Meta developer app, a connected Facebook Page/Instagram professional account and an HTTPS host with persistent disk. Enter credentials in the host’s secret settings or a private `.env`; do not paste them into customer-visible theme code.

Run checks with:

```sh
npm run check
npm test
```

See [docs/VALIDATION.md](docs/VALIDATION.md) for the completed checks and remaining live acceptance steps.

## Files

- `src/` — HTTP server, encrypted storage, OAuth and social sync.
- `public/` — dashboard and local gallery preview.
- `extensions/social-gallery/` — Shopify gallery app block, translations, CSS and JavaScript.
- `tests/` — security, data lifecycle and connector tests using mocked external services.
- `shopify.app.toml` — app registration configuration; replace marked values before deployment.
- `.env.example` — live server configuration template, without credentials.
- `Dockerfile` and `compose.yaml` — single-instance deployment with persistent data.

The source is provided for your store to customize and deploy. No third-party runtime libraries are bundled. Keep the Node runtime and API versions maintained as platform requirements evolve.
