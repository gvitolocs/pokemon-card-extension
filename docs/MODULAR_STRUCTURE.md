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
- Coordinates startup lifecycle events

### `core/CacheManager.js`

- Manages runtime caches
- Tracks processed elements and successful matches
- Reduces repeated lookups for identical inputs

### `ui/ButtonManager.js`

- Creates and clones Pokoin marketplace buttons
- Inserts buttons into supported marketplace layouts
- Handles visual state updates (loading/success/disabled)

### `data/TitleExtractor.js`

- Extracts listing titles from site-specific DOM
- Parses card metadata from free text
- Builds normalized cache keys

### `utils/UrlGenerator.js`

- Builds Pokoin marketplace card and search URLs
- Centralizes URL sanitation/open logic

### `processors/*.js`

- Encapsulate site-specific integration logic:
  - `VINT.js`: Vinted selected-chip overlay, preview rows, and structured search payload
  - `EBAYE.js`: eBay product overlay using the same selected-key workflow
  - `CME.js`: only active Cardmarket product-page path; historical `content.js` Cardmarket fallback is inert
  - `PromoFilter.js`: extra promotional filtering

### `pokoin-auth-bridge.js`

- Runs only on `https://pokoin.com/extension/auth-bridge`
- Accepts object or JSON-string token messages and `token.accessToken`
- Forwards a normalized token to the background worker

### `ui-pages/sidepanel.*`

- Embeds the Pokoin marketplace card page in the Chrome side panel
- Consumes `sidePanelState` owned by a monotonic request id
- Emits iframe reuse/change debug events

## Runtime Flow

1. Manifest injects config/core/ui/data/utils/processors + `content.js`
2. `content.js` initializes global runtime behavior
3. Site processor detects listings and extracts title info
4. Pokoin/Cardvault API lookup resolves best match
5. Button state is updated and opens the side panel with the generated Pokoin destination URL

## Side Panel Matching Workflow

1. `config/background.js` scrapes the active marketplace page title with site-specific selectors, or reuses overlay selected chips and `previewRows` when Vinted/eBay have already scanned the listing.
2. The title is normalized into structured fields (`name`, `collectorNumber`, `expansion`, `rarity`, `variation`).
3. Marketplace noise is removed before search. Vinted terms such as `pokemon`, `pokémon`, `pkkmn`, `pkn`, `pokn`, `sealed`, `salead`, `pack`, `booster`, and `lot` are ignored.
4. Strong selected or scraped evidence goes to `/api/extension-card-search` first.
5. If that exact path is empty or weak, `POST /api/searchbar-token-predict` tries a lightweight card-name token, then retries `/api/extension-card-search`.
6. If token prediction is empty, low-confidence, or unavailable, `POST /api/marketplace-autocomplete` canonicalizes likely name phrases. Autocomplete is also the later broad candidate-fill fallback when structured rows remain insufficient.
7. The side panel and injected marketplace buttons resolve names from the same Cardvault-backed data, so they do not depend on the old local Pokémon-name list or disagree on the best card.

## Local Display Workflow

1. Injected Pokoin buttons open the Chrome side panel for the current tab instead of opening a new Pokoin tab.
2. The side panel iframe remains the place where Pokoin is shown, preserving the user's logged-in Pokoin session.
3. Candidate rows use compact metadata: first collector number only (`129` from `SVP 129`, `232` from `232/091`) plus an expansion shortname.
4. If Cardvault rows expose an explicit expansion code, use it. Otherwise derive one from the promo/collector prefix or expansion initials; if no useful shortname is available, show the expansion name.

## Notes

- Keep processor logic site-focused and avoid cross-site DOM assumptions.
- Names such as `generateCardTraderLink`, `searchCardInDatabase`, and `blueprint_id` are compatibility surfaces for older processor code. New behavior should route through Pokoin/Cardvault APIs and side-panel URLs.