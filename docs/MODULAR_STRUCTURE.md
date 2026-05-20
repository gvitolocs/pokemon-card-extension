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
│   ├── popup.html
│   ├── popup.js
│   ├── settings.html
│   └── settings.js
├── utils/
│   └── UrlGenerator.js
├── content.js
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

- Creates and clones CardTrader buttons
- Inserts buttons into supported marketplace layouts
- Handles visual state updates (loading/success/disabled)

### `data/TitleExtractor.js`

- Extracts listing titles from site-specific DOM
- Parses card metadata from free text
- Builds normalized cache keys

### `utils/UrlGenerator.js`

- Builds CardTrader and search URLs
- Centralizes URL sanitation/open logic

### `processors/*.js`

- Encapsulate site-specific integration logic:
  - `EBAYE.js`
  - `VINT.js`
  - `CME.js` (Cardmarket)
  - `PromoFilter.js` (extra filtering)

## Runtime Flow

1. Manifest injects config/core/ui/data/utils/processors + `content.js`
2. `content.js` initializes global runtime behavior
3. Site processor detects listings and extracts title info
4. Pokoin/Cardvault API lookup resolves best match
5. Button state is updated with the generated destination URL

## Side Panel Matching Workflow

1. `config/background.js` scrapes the active marketplace page title with site-specific selectors.
2. The title is normalized into structured fields (`name`, `collectorNumber`, `expansion`, `rarity`, `variation`).
3. Marketplace noise is removed before search. Vinted terms such as `pokemon`, `pokémon`, `pkkmn`, `pkn`, `pokn`, `sealed`, `salead`, `pack`, `booster`, and `lot` are ignored.
4. Before card search, the side panel resolves candidate title terms through Cardvault autocomplete, which uses `marketplace_card_names_for_language(...)` behind the API. If a term returns an exact canonical card name, that Cardvault name replaces the locally guessed name.
5. `/api/extension-card-search` is tried first with the Cardvault-resolved name. Returned rows are accepted only if the returned card name matches the resolved structured name, preventing weak fuzzy matches like unrelated promo cards.
6. If structured search has no accepted rows, the extension falls back to `/api/marketplace-autocomplete`.
7. The side panel and injected marketplace buttons resolve names from the same Cardvault-backed data, so they do not depend on the old local Pokémon-name list or disagree on the best card.

## Local Display Workflow

1. Injected Pokoin buttons open the Chrome side panel for the current tab instead of opening a new Pokoin tab.
2. The side panel iframe remains the place where Pokoin is shown, preserving the user's logged-in Pokoin session.
3. Candidate rows use compact metadata: first collector number only (`129` from `SVP 129`, `232` from `232/091`) plus an expansion shortname.
4. If Cardvault rows expose an explicit expansion code, use it. Otherwise derive one from the promo/collector prefix or expansion initials; if no useful shortname is available, show the expansion name.

## Notes

- Keep processor logic site-focused and avoid cross-site DOM assumptions.