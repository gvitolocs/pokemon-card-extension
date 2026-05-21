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
- Sends authenticated Cardmarket scrape observations to `/api/cardmarket-scrape-observation`

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

## Pokoin Auth Bridge

The extension cannot read the Pokoin web Firebase session from Cardmarket pages. When a Cardmarket observation needs auth, the background worker opens or reuses `https://pokoin.com/extension/auth-bridge` without focusing it. The Pokoin page should call `FirebaseAuth.currentUser.getIdToken()` after receiving `POKOIN_EXTENSION_AUTH_TOKEN_REQUEST` and reply to itself with a `POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE` message containing `token` and optional `expiresAt`.

`pokoin-auth-bridge.js` runs only on that Pokoin path, accepts `postMessage` events only from `https://pokoin.com`, and forwards valid token messages to the background worker. The background worker stores tokens only in `chrome.storage.session` under `pokoinAuthSession` with expiry metadata. Auth tokens are never written to `chrome.storage.local` and are not sent to marketplace content scripts.

## Cardmarket Observations

Cardmarket observations are posted to `https://pokoin.com/api/cardmarket-scrape-observation` with `Authorization: Bearer <Firebase ID token>`. Payloads include `structuredCard`, `cardmarketContext`, `match`, and `promoteVerifiedLink`.

Automatic Cardmarket navigation/search observations use `promoteVerifiedLink: false`. Explicit Cardmarket side-panel opens with a selected or best match use `promoteVerifiedLink: true`, which lets Pokoin persist the full Cardmarket URL into `marketplace_cm_verified_links`. Missing-token observations are queued in `chrome.storage.session` and flushed after the bridge supplies a token.

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