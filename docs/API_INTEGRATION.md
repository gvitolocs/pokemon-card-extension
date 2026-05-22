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
- Calls `/api/searchbar-token-predict` for lightweight card-name token identification before heavier resolver work
- Uses `/api/marketplace-autocomplete` as the Cardvault name-index resolver for ambiguous or misspelled names when token prediction is empty or low-confidence, then as the broader fallback candidate source when needed
- Enriches candidate prices through `/api/marketplace-blueprint-price?blueprintId=:id`
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
3. Structured exact search runs first through `/api/extension-card-search` when selected chips or page metadata include strong name/variation/collector/expansion evidence.
4. If the exact path is weak or empty, the background first calls `/api/searchbar-token-predict` with likely name phrases. High-confidence predictions that extend the scraped fragment are retried through `/api/extension-card-search`.
5. If token prediction is empty, low-confidence, or unavailable, the background calls `/api/marketplace-autocomplete` with likely name phrases to recover backend canonical names from Cardvault's name index. Results are cached by normalized query, language, source, and selected clue signature.
6. Standalone context tokens such as `holo`, `delta`, `illustration`, level text, expansion names, condition words, and collector numbers are not sent as primary name resolver queries.
7. After canonicalization, `/api/extension-card-search` is retried with the canonical name while preserving collector, variation, rarity, and expansion constraints.
8. Autocomplete is used as the broader fallback candidate source only after structured rows remain insufficient.
9. Successful matches preserve backend-provided `canonicalUrl` / `marketplaceUrl` / canonical path fields and prefer those URLs in the side panel, falling back to `https://pokoin.com/marketplace/en/cards/:id` only when no canonical URL is supplied.
10. Candidate rows preserve `previewImageUrl`/`preview_image_url` and the side panel uses that thumbnail before falling back to full image or expansion logo.

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