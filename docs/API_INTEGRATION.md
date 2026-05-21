# Pokoin/Cardvault API Integration

## Overview

The active extension resolves cards through Pokoin/Cardvault endpoints hosted at `https://pokoin.com`. Older CardTrader token and direct browser database ideas are historical only; the current runtime does not call CardTrader APIs with a user token and does not connect directly to Supabase or any browser-side database client.

## Main Integration Points

### `config/api-config.js`

- Lightweight compatibility config loaded before runtime scripts
- Defines the Pokoin base URL used by legacy helpers
- Does not configure Supabase or CardTrader token access

### `config/background.js`

- Owns the reliable marketplace search path
- Calls `/api/extension-card-search` for structured matching
- Falls back to `/api/marketplace-autocomplete` when needed
- Builds the canonical side-panel state

### `content.js` and processors

- Title extraction and normalization
- Compatibility adapters such as `searchCardInDatabase`
- Marketplace-specific button wiring and side-panel messages
- Legacy-shaped result objects (`blueprint_id`, `name_en`, `expansion_name_en`) for older processor call sites

## Link Generation Strategy

1. CardTrader card pages with `/cards/:id` use that URL blueprint id directly as the Pokoin card id.
2. Other marketplace pages send title and structured clues to the background service worker.
3. Structured search runs first through `/api/extension-card-search`.
4. Autocomplete is used as the fallback candidate source.
5. Successful matches open `https://pokoin.com/marketplace/en/cards/:id` in the side panel.

## Compatibility Names

Some function names still carry old integration language:

- `searchCardInDatabase` now calls Pokoin/Cardvault APIs and returns legacy-shaped rows for processor compatibility.
- `generateCardTraderLink` should be treated as a compatibility name for generating Pokoin marketplace card URLs.
- `blueprint_id` remains in processor-facing result objects because several call sites still expect it.

These names are harmless compatibility surfaces as long as they continue to route to Pokoin/Cardvault behavior.

## Failure Modes

- Pokoin/Cardvault API rate limiting
- Timeouts/network interruptions
- Incomplete title metadata for precise matching

Expected behavior in failures:

- The side panel reports the failed refresh state.
- Marketplace scanning and button insertion should remain functional.
- Processors can continue through background fallback even when content-script search is unavailable.

## Maintenance Notes

- Keep docs aligned with existing files only.
- Do not add Supabase/browser database clients to content scripts.
- Do not reintroduce CardTrader token/API configuration unless the runtime is deliberately rebuilt for it.
- Prefer Pokoin/Cardvault naming in new code; keep legacy names only where they preserve existing call-site compatibility.