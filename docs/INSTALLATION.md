# Installation Guide

## Quick Setup

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder.

## Verify Installation

1. Confirm the extension icon appears in the Chrome toolbar. The MV3 action has no popup; it opens the side panel.
2. Open a supported marketplace listing (Vinted, eBay, Cardmarket, or CardTrader).
3. Confirm a Pokoin button appears and opens the Chrome side panel.

## Functional Checks

### Automatic Check

1. Open eBay, Vinted, Cardmarket, or CardTrader.
2. Browse Pokemon card listings.
3. Verify Pokoin buttons appear on supported listing or card pages.

### Overlay check

1. Open a Vinted or eBay product listing.
2. Confirm the top-left overlay shows the Pokoin button and clue chips.
3. Click the button and confirm the Chrome side panel loads a Pokoin card page.

`ui-pages/popup.html` is leftover and is not opened by the toolbar action. See `docs/LEFTOVERS.md`.

## Troubleshooting

### Overlay still shows an old version (v2.0.7)

Chrome is using a previously **Load unpacked** folder (usually `~/Desktop/pokoin-extension`) and the service worker was not Reloaded. The Mac repo path is `/Users/giuseppe/mnt/nezopt/Projects/pokemon-card-extension`. Remove the extension, Load unpacked on that repo folder, then confirm `chrome://extensions` and the overlay both say the current `manifest.json` version. Full notes: `docs/DESKTOP_RELOAD.md`.

### Extension Does Not Load

- Verify `manifest.json` is valid.
- Confirm all referenced scripts exist in their configured paths.
- Reload the extension in `chrome://extensions/`.

### Links Do Not Appear

- Check browser console logs on marketplace pages.
- Confirm you are on a supported domain.
- Refresh the page after enabling/reloading the extension.

### Pokoin API Errors

- Check browser console logs for `extension-card-search` or autocomplete failures.
- Confirm `https://pokoin.com` is reachable.
- Reload the extension after changing host permissions or API code.

## Security Notes

- The active extension does not require CardTrader or Supabase tokens.
- Do not commit private tokens, `.env` files, or service-role credentials.
- Keep host permissions limited to required domains.
