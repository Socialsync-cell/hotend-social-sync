# Mobile-friendly Social gallery carousel

This update uses the existing Shopify app configuration and extension UID from
your latest uploaded ZIP. It updates the same Social gallery block already added
to your theme. It has not been published to Shopify yet.

## Publish on your Windows computer

1. Extract the entire ZIP to a new folder. Do not run it from inside the ZIP.
2. Open the extracted `social-sync-main` folder and double-click
   **update-gallery-carousel.cmd**.
3. Sign in to Shopify if prompted. Review the release summary: it should target
   **Hotend Social Sync** and update the existing **Social gallery** extension.
   If another app is shown or unrelated extensions would be deleted, cancel.
4. Confirm the release. Wait until Shopify reports the version was released,
   then refresh your storefront and theme editor after a few minutes.
5. Keep your existing Social gallery block. No reinstall or new block is needed.

Node.js 24 or newer is required. The launcher installs Shopify CLI if missing,
checks the existing app/extension identifiers, validates the app configuration,
and runs `shopify app deploy --config gallery`. Keep the window open if an error
appears so you can copy the error text.

## Layout

- One horizontal row on mobile and desktop.
- One full card at a time on phones, with native horizontal swipe/scroll.
- Desktop keeps your current card-count setting. To show one card on desktop
  too, open the Social gallery settings and set **Cards visible on desktop**
  to **1**, then save. The available range is 1–4.
- Narrow tablet sections show up to two cards; very narrow sections show one.
- Previous/next buttons have 44-pixel touch targets and a position counter.
- Keyboard users can focus the carousel and use arrow keys, Home, and End.
- Navigation supports right-to-left layouts and reduced-motion preferences.
- No automatic rotation; visitors control the movement.
- Text-only comments and image posts both work. Empty galleries remain hidden
  on the storefront and show a message in the theme editor.

The storefront update requires a Shopify extension release. A Render deployment
alone will not update the Shopify block. No Render deployment is needed for this
storefront change; redeploy Render only if you also want its admin preview page
to use the new gallery assets.

The admin dashboard already includes responsive layouts. This update changes
the customer-facing Social gallery and the gallery preview, not the moderation
workflow. Facebook author names are still supplied by Meta; the carousel cannot
restore names Meta does not return.

If the gallery is inside Made with Hotend and invisible while logged out, move
it into a standalone Apps section. That theme section previously restricted app
blocks to logged-in customers.

Keep this extracted project folder for your next update; it contains the
existing Shopify configuration and extension UID.
