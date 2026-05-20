# Installation Guide

## Quick Setup

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder.

## Verify Installation

1. Confirm the extension icon appears in the Chrome toolbar.
2. Open the popup.
3. Run a quick manual title test, for example:

```text
Glaceon ex Special Illustration Rare #150 Terastal Festival
```

## Functional Checks

### Automatic Check

1. Open eBay/Vinted/Cardmarket.
2. Browse Pokemon card listings.
3. Verify CardTrader buttons appear under listing titles.

### Manual Check

1. Open the popup.
2. Paste a listing title.
3. Generate a CardTrader link.
4. Confirm link output and click behavior.

## Troubleshooting

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

- Store API tokens only in extension settings.
- Do not commit private tokens or service-role credentials.
- Keep host permissions limited to required domains.
