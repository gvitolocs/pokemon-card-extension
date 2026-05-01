# Modular Structure

## Overview

The extension is organized into modules to keep responsibilities isolated and easier to maintain.

```text
pokemon-card-extension/
├── config/
│   ├── api-config.js
│   ├── background.js
│   ├── supabase-config.js
│   └── supabase-integration.js
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
├── content-modular-example.js
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
4. Database lookup resolves best match
5. Button state is updated with the generated destination URL

## Notes

- `content-modular-example.js` is a reference implementation and not the active runtime entrypoint.
- Keep processor logic site-focused and avoid cross-site DOM assumptions.