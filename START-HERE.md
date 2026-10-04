> **Mobile carousel update:** Start with [CAROUSEL-UPDATE.md](CAROUSEL-UPDATE.md) and run **update-gallery-carousel.cmd**. This ZIP now includes your existing deployed app and extension identifiers; no Client ID setup is needed for this update. Earlier setup instructions below are retained for reference.

# Make Social gallery appear in your theme

The supplied project already contains the `Social gallery` theme app extension.
The uploaded `shopify.app.toml` still used a placeholder Shopify Client ID and
example URLs, and its validation notes recorded no completed extension deployment.
Those files cannot prove what has since been released in your Shopify account,
but they show why uploading the repository to Render alone is not enough.

This package corrects the app URL and Shopify callback to
`https://social-sync-t82i.onrender.com`. A helper creates a separate
`shopify.app.gallery.toml` using the Client ID of your existing Shopify app.
The gallery code and Render server code have been preserved.

## Windows steps

1. Extract this ZIP completely. Open the extracted `social-sync-main` folder.
2. Install Node.js 24 LTS if needed: https://nodejs.org/en/download.
3. Double-click **deploy-theme-block.cmd**. It installs the official Shopify CLI
   from npm if the `shopify` command is not installed.
4. When asked for **Shopify Client ID**, copy the value of **SHOPIFY_API_KEY** from
   **Render > Social Sync > Environment**. This is the Client ID of the Shopify
   app already installed on your store. It is NOT the numeric Meta/Facebook App ID.
   Do not enter a Shopify or Meta App Secret. No secret is needed by the helper.
5. Complete Shopify's sign-in in your browser when prompted. Use the developer
   account that owns the installed Social Sync Shopify app.
6. Validation must succeed. In Shopify's deployment summary, confirm the target
   is your existing Social Sync app and that **Social gallery** is included.
   Cancel if it names another app or proposes deleting unrelated extensions.
   The configuration includes the existing standalone app URL, proxy and webhook
   routes from this project. Review those changes before approving the release.
7. After Shopify reports success, allow several minutes and reopen
   **Online Store > Themes > Customize** for the desired theme.
8. On the home-page template, choose **Add section > Apps > Social gallery**.
   You can also use **Add block > Apps** inside a section that supports app blocks.
9. Keep the proxy path **/apps/social-sync/feed**, set the heading and save.

The block's menu label is **Social gallery**. This extension is an app block, so
it is not listed in the App embeds panel.

## If using a terminal instead

From the extracted app folder, run these commands in order:

```sh
npm install -g @shopify/cli@latest
node scripts/prepare-theme-deploy.mjs
shopify app config validate --config gallery --json
shopify app deploy --config gallery
```

The helper validates the Client ID format, preserves the original config and
backs up an existing `shopify.app.gallery.toml` before replacing it. Deployment
uses `--config gallery` explicitly so a previous CLI project selection cannot
silently select a different configuration.

Keep the generated configuration and any Shopify-generated `uid` in
`extensions/social-gallery/shopify.extension.toml` for later releases. Use the
same extracted project when deploying again, or commit those files to the source
repository. Neither file needs an App Secret.

## If the block still does not appear

- In the Shopify Dev Dashboard, open the same Shopify app and check the active
  released version contains **Social gallery**. A Render deploy does not create
  this Shopify release. A draft/unreleased Shopify version is also insufficient.
- Check that this Shopify app is installed on `vzspbr-c8.myshopify.com`.
- Try **Add section > Apps** on the home-page template. An individual theme
  section may not accept app blocks. JSON templates and app-block support are
  required; no theme code has been edited by this package.
- If Shopify validation or deploy fails, keep the terminal open and share the
  error text with secret values removed. Do not repeatedly change Meta settings
  to fix a missing theme-editor entry.

## If the block appears but no posts are visible

This is a separate check from the block being listed in the editor. Connect your
social accounts, choose the Page, sync, and publish eligible items in Social Sync.
The extension shows an empty/error message in the editor and hides empty/error
galleries on the live storefront. The proxy must route `/apps/social-sync/feed`
to the Render server's `/proxy/feed`. If the proxy prefix was previously changed
for this app installation, check its actual path in Shopify and match it in the
block setting.

## What has been verified

See `docs/THEME-BLOCK-FIX.md` for the validation results. Local checks cannot
confirm the live Shopify release, theme compatibility or Meta connection.

## Shopify references

- Deploy/release theme extensions: https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/build
- Named app configurations: https://shopify.dev/docs/apps/build/cli-for-apps/manage-app-config-files
- Theme app-block support: https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks
