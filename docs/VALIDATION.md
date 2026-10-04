# Validation record

Development validation performed on 17 September 2026 using Node.js 24.19.0.

## Completed

- Node syntax checks for the server, dashboard JavaScript and gallery component.
- 18 automated tests: token encryption/tamper detection; Shopify proxy signature fixture; OAuth browser binding and replay prevention; moderation persistence; published-feed filtering; production/demo separation; URL sanitization; Meta pagination and expired tokens; customer-content normalization; erasure during an in-flight sync; authenticated admin actions and CSRF; store-specific feed authorization; mocked Shopify OAuth exchange; uninstall cleanup; Meta signed deletion; expired sessions; optional Meta Business Login configuration.
- Shopify Theme Check passed all five gallery files: Liquid block, CSS, JavaScript and both locale files. The validator used its bundled Shopify documentation after the online documentation refresh was unavailable.
- Chromium browser checks passed: six sample cards render; status filtering, publishing and moving back to pending persist; search filters correctly; pausing/resuming controls the gallery; the preview includes only three published sample items; dashboard and gallery have no horizontal overflow at 390px; no dashboard JavaScript exceptions. Preview PNGs are included in this folder.

All external-service responses in automated tests are mocks. Tests do not prove access to a real Shopify store or Meta account.

## Not completed here

- Shopify authenticated app config validation: CLI installation succeeded, but the command could not connect to `accounts.shopify.com/oauth/device_authorization` (proxy connection timed out).
- Actual Shopify installation, extension deployment and theme-editor rendering.
- Real Meta OAuth, live Page/Instagram permissions, approval of this content-display use case and actual source synchronization.
- Public hosting, domain/TLS setup and production monitoring.

## Live acceptance checks

1. Deploy the server and extension, run authenticated app configuration validation, then install on the intended store.
2. Verify Shopify login succeeds for that store and rejects another shop domain.
3. Connect Meta, select the intended Page, and verify the expected linked Instagram username is shown.
4. Use a permitted test account to create a tagged Instagram post, an Instagram comment, a Facebook visitor post and a Facebook comment. Check each supported source after syncing.
5. Confirm inaccessible/private content is not imported. Verify exact discovery behavior under the granted permissions.
6. Publish/hide/move-to-pending an item and check the actual Shopify gallery after reloading.
7. Change automatic publishing, add a new item, and confirm its initial moderation status.
8. Assign a real product handle and verify matching on that product page only when the block’s product filter is enabled.
9. Delete a source item, then verify source revalidation removes it or the 48-hour freshness limit withholds it. Confirm reconnect behavior after token revocation.
10. Disconnect and verify stored social data and public gallery content are erased. Test signed Meta deletion and Shopify uninstall delivery.
11. Restart the host and confirm data persists and periodic syncing resumes. Verify the volume is retained on redeploy.
12. Check phone/tablet/desktop layouts in the actual theme, keyboard navigation, source links and image errors.

This is a development release. Complete these account-dependent checks before treating the connector as production-verified.
