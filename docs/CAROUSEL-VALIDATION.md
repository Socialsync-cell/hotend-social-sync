# Carousel update verification — 22 September 2026

- All 22 existing application and deployment tests passed (`npm test`).
- JavaScript syntax checks passed (`npm run check`).
- Shopify Liquid/theme extension validator passed all five changed files:
  block, stylesheet, JavaScript, storefront translations and schema translations.
  The validator used its bundled Shopify definitions after an upstream docs
  refresh timed out.
- Six additional DOM-level checks passed using Happy DOM with mocked geometry:
  desktop stepping and boundaries; mobile navigation and responsive counter;
  right-to-left navigation; single-item/empty/error handling; theme-editor
  reattachment and instance independence; safe rendering of text and source links.
- The update target checker accepts the supplied deployment identity and rejects
  a mismatched app/extension pair.
- `shopify.app.gallery.toml` and the extension's `shopify.extension.toml` are
  byte-for-byte unchanged from the latest uploaded ZIP.

Visual browser testing was blocked by the preview browser's local-page policy.
The DOM tests do not validate actual CSS layout, physical touch gestures or
Shopify's live theme rendering. Check the released gallery in the theme editor's
mobile preview and on a phone. This package has not been deployed to Shopify or
Render from this session.
