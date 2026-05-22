# Extension Agent Handoff

## Current State

This repository is the Chrome extension for matching marketplace card listings to Pokoin/Cardvault cards. The active runtime is Manifest V3, with marketplace processors in `processors/`, a background service worker in `config/background.js`, and the side panel UI in `ui-pages/`.

The extension is now centered on a selected-key-first workflow:

- Vinted and eBay render a top-left transparent overlay with a Pokoin button, selectable clue chips, and preview candidates.
- Selected chips are the canonical first search layer. Raw title scraping and autocomplete fallback happen only after selected-key search is unavailable or insufficient.
- Vinted/eBay selected payloads carry structured fields: `name`, `variation`, `variationTokens`, `collectorNumber`, `numericCollectorNumber`, `expansion`, `features`, `rarity`, and now `rarityAliases`.
- Cardmarket uses a readiness-gated product parser and sends scrape observations to Pokoin after matching.
- CardTrader direct URLs use the blueprint id from the URL and bypass generic search.

## Recent Extension Changes

- Owner/team composite matching:
  - Vinted detects titles such as `Mimikyu del Team Rocket`.
  - The overlay creates and defaults `Team Rocket's Mimikyu`.
  - Background name resolution tries `Team Rocket's Mimikyu` before generic `Mimikyu`.

- Vinted/eBay overlay placement:
  - Both overlays are anchored to the top-left viewport edge.
  - Broad fixed hosts use `pointer-events: none`; only visible controls are interactive.

- Illustration rarity alias support:
  - The UI can keep the simple `illustration` chip.
  - Background normalizes selected illustration evidence into `rarityAliases`:
    - `Illustration Rare`
    - `Special Illustration Rare`
    - `full art`
    - `illustration`
  - `/api/extension-card-search` receives `rarityAliases`.
  - Autocomplete fallback tries alias query forms such as `Sprigatito Illustration Rare` and `Sprigatito Special Illustration Rare`.
  - Ranking prefers rows whose `rarity` or row metadata matches the illustration aliases over generic same-name rows.

## Important Matching Rules

Keep these rules intact when changing marketplace matching:

1. Exact collector evidence wins first. Preserve printed forms like `TG16/TG30`, `RC32/RC32`, `SV-P 129`, `DRS 009`, `HL 9`, and `14/100`.
2. Numeric collector equivalence is a fallback only. It must not outrank exact prefixed/slash collector evidence.
3. Validated composite names beat shorter species names:
   - `Rocket Zapdos`
   - `Team Rocket's Mimikyu`
   - `Espeon & Deoxys ex`
   - `Arven's Mabosstiff ex`
   - `Alto Mare's Latias`
4. Explicit forms/variations are required evidence when selected:
   - `Mega + X/Y + ex`
   - `Mega + ex`
   - `VMAX`, `VSTAR`, `V`, `GX`, `ex`
5. Rarity/feature chips should be expanded to backend-compatible aliases before search.
6. Price enrichment, Cardmarket observation auth, and fallback autocomplete are decoration/recovery. They must not replace stronger overlay-selected rows for the same URL/signature.

## APIs Used

- `POST https://pokoin.com/api/extension-card-search`
  - Main structured search endpoint.
  - Payload includes name, collector numbers, expansion, rarity, `rarityAliases`, variation, edition hint, language, and limit.

- `POST https://pokoin.com/api/marketplace-autocomplete`
  - Fallback name/title search.
  - Used after exact selected-key or structured search paths.

- `GET https://pokoin.com/api/cardtrader-redirect?id=:cardId`
  - Used for listing price enrichment.
  - Result is decoration only.

- `POST https://pokoin.com/api/cardmarket-scrape-observation`
  - Sends Cardmarket scrape observations.
  - Requires `Authorization: Bearer <firebase-id-token>`.
  - Payload includes top-level `url`, page metadata, structured card, context, match, source, extension version, and promotion flag.

## Auth Flow

Cardmarket observations use a Pokoin-origin auth bridge:

1. Background opens or reuses `https://pokoin.com/extension/auth-bridge`.
2. `pokoin-auth-bridge.js` accepts object or JSON-string token messages from `https://pokoin.com`.
3. Current Pokoin payload shape is `token.accessToken`.
4. The bridge normalizes to `POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE`.
5. Background stores the token in `chrome.storage.session.pokoinAuthSession`.
6. Pending Cardmarket observations flush with `Authorization: Bearer <token>`.
7. The bridge tab is closed only when it is the tracked extension-opened auth bridge tab.

Tokens must never be stored in `chrome.storage.local` or exposed to marketplace content scripts.

## Verification Steps

Run:

```bash
node --test tests/extension-workflow.test.js
```

Expected: all tests pass.

When runtime files change, rebuild:

```bash
rm -f dist/pokemon-card-extension-2.0.0.zip
zip -r dist/pokemon-card-extension-2.0.0.zip manifest.json content.js pokoin-auth-bridge.js assets config processors ui-pages docs README.md -x "*.DS_Store" "*/.DS_Store" "docs/POKOIN_AUTH_CARDMARKET_BLOCKER.md"
node --test tests/extension-workflow.test.js
```

The zip hash guard in the tests checks that packaged runtime files match source.

## Remaining Work

- Validate the live Pokoin `/api/extension-card-search` behavior with `rarityAliases`. The extension now sends the field, but backend support should be confirmed in production logs/API traces.
- If the backend does not yet consume `rarityAliases`, it should map the aliases server-side or accept multiple rarity values.
- Consider adding explicit row fields for rarity match confidence in the API response, so the extension can avoid guessing from text fields.
- Keep testing real Vinted/eBay screenshots where the card image shows rarity or collector evidence missing from the text title.
