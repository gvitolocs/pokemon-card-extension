# Modular Structure

## Overview

The extension is organized into modules to keep responsibilities isolated and easier to maintain.

```text
pokemon-card-extension/
├── config/
│   ├── api-config.js
│   └── background.js
├── core/
│   ├── ExtensionCore.js
│   └── CacheManager.js
├── data/
│   └── TitleExtractor.js
├── processors/
│   ├── EBAYE.js
│   ├── VINT.js
│   ├── CME.js
│   └── PromoFilter.js
├── ui/
│   └── ButtonManager.js
├── ui-pages/
│   ├── sidepanel.html
│   ├── sidepanel.js
│   ├── sidepanel.css
│   ├── popup.html
│   ├── popup.js
│   ├── settings.html
│   └── settings.js
├── utils/
│   └── UrlGenerator.js
├── content.js
├── pokoin-auth-bridge.js
└── manifest.json
```

## Module Responsibilities

### `core/ExtensionCore.js`

- Initializes extension state
- Handles URL change events for SPA-like navigation
- Coordinates startup lifecycle events with DOMContentLoaded and a one-shot 200ms force-start
- Does not poll the DOM on an interval

### `core/CacheManager.js`

- Loaded by `manifest.json`, never constructed. Live cache state lives on `PokemonCardTraderLinker` and the processors. See `docs/LEFTOVERS.md`.

### `ui/ButtonManager.js`

- Loaded by `manifest.json`, never constructed. Live buttons are created by processors and `content.js`.

### `data/TitleExtractor.js`

- Loaded by `manifest.json`, never constructed. Live parsing is `window.extractTitleInfo` in `content.js` plus processor parsers.

### `utils/MatchContract.js`

- Lecture 14 match spec shared by the overlay, background worker, and side panel
- Stages: awaiting-tokens, tokens (chips are not a match), chip-search/resolved, scan-merge
- `setSidePanelState` applies the contract so tokens and completed chip-search cannot leave `loading: true`
- Vinted tokens-ready starts Cardvault chip-search immediately; overlay preview rows are not a gate
- Scan merge must preserve a selected species name on singles listings
- Does not fetch; Cardvault and cardscan remain the existing implementations of this spec

### `utils/ListingScan.js`

- Shared Vinted/eBay listing-kind classification and cardscan identify payload helpers
- Loaded by marketplace content scripts and imported by `config/background.js`
- Classifies album vs singles from raw title/description, photo count, and scan box/hit counts
- Does not fetch; the background worker owns `POST https://cardscan.pokoin.com/identify-album` for every listing insertion (fallback `/identify?album=1`)

### `utils/UrlGenerator.js`

- Loaded by `manifest.json`, never constructed. Live Pokoin URLs are built in processors/`content.js`/`config/api-config.js`.

### `processors/*.js`

- Encapsulate site-specific integration logic:
  - `VINT.js`: Vinted selected-chip overlay, preview rows, and structured search payload
  - `EBAYE.js`: eBay product overlay using the same selected-key workflow; listing-feed buttons search on click
  - `CME.js`: only active Cardmarket product-page path; historical `content.js` Cardmarket fallback is inert; listing-feed buttons search on click
  - `PromoFilter.js`: extra promotional filtering

### `content.js`

- Compatibility runtime after processors: CardTrader helpers, inert marketplace fallbacks, and `searchCardInDatabase` as a background `searchCardForTitle` adapter
- Must not fetch Pokoin/Cardvault APIs from the marketplace page origin

### `pokoin-auth-bridge.js`

- Runs only on `https://pokoin.com/extension/auth-bridge`
- Accepts object or JSON-string token messages and `token.accessToken`
- Forwards a normalized token to the background worker

### `ui-pages/sidepanel.*`

- Embeds the Pokoin marketplace card page in the Chrome side panel
- Consumes `sidePanelState` owned by a monotonic request id
- Emits iframe reuse/change debug events

### `ui-pages/popup.*` and `settings.*`

- Not referenced by `manifest.json` `action`. Leftover manual UI. See `docs/LEFTOVERS.md`.

## Runtime Flow

1. Manifest injects config/core/ui/data/utils/processors + `content.js`
2. `content.js` initializes global runtime behavior
3. Site processor detects listings and extracts title info
4. Processors send `searchCardForTitle` to `config/background.js`; leftover `content.js` search uses the same message
5. Button state is updated and opens the side panel with the generated Pokoin destination URL

## Side Panel Matching Workflow

1. `config/background.js` scrapes the active marketplace page title with site-specific selectors, or reuses overlay selected chips and `previewRows` when Vinted/eBay have already scanned the listing.
2. The title is normalized into structured fields (`name`, `collectorNumber`, `expansion`, `rarity`, `variation`).
3. Marketplace noise is removed before search. Vinted terms such as `pokemon`, `pokémon`, `pkkmn`, `pkn`, `pokn`, `sealed`, `salead`, `pack`, `booster`, and `lot` are ignored.
4. Strong selected or scraped evidence goes to `/api/extension-card-search` first.
5. If that exact path is empty or weak, `POST /api/searchbar-token-predict` tries a lightweight card-name token, then retries `/api/extension-card-search`. This hop is skipped when a selected multi-word clue already is the structured search name.
6. If token prediction is empty, low-confidence, skipped, or unavailable, `POST /api/marketplace-autocomplete` canonicalizes likely name phrases. Autocomplete is also the later broad candidate-fill fallback when structured rows remain insufficient, but not when exact collector+name rows are already good enough.
7. Resolved search, name-resolution, and token-prediction LRU maps persist in `chrome.storage.session.pokoinSearchLruCache` so service-worker restarts can reuse them.
8. The side panel and injected marketplace buttons resolve names from the same Cardvault-backed data, so they do not depend on the old local Pokémon-name list or disagree on the best card.

## Local Display Workflow

1. Injected Pokoin buttons open the Chrome side panel for the current tab instead of opening a new Pokoin tab.
2. The side panel iframe remains the place where Pokoin is shown, preserving the user's logged-in Pokoin session.
3. Candidate rows use compact metadata: first collector number only (`129` from `SVP 129`, `232` from `232/091`) plus an expansion shortname.
4. If Cardvault rows expose an explicit expansion code, use it. Otherwise derive one from the promo/collector prefix or expansion initials; if no useful shortname is available, show the expansion name.

## Notes

- Keep processor logic site-focused and avoid cross-site DOM assumptions.
- Names such as `generateCardTraderLink`, `searchCardInDatabase`, and `blueprint_id` are compatibility surfaces for older processor code. New behavior should route through Pokoin/Cardvault APIs and side-panel URLs.
- Unused modules and dead `content.js` helpers are listed in `docs/LEFTOVERS.md`.