# CardTrader API Integration

## Overview

The extension supports token-based CardTrader API behavior for more specific link generation and richer lookup flows.

## Main Integration Points

### `config/api-config.js`

- API base URL settings
- Request timeout settings
- Basic request behavior and guardrails

### `ui-pages/settings.html` + `ui-pages/settings.js`

- User-facing token input
- Option to enable advanced API mode
- Persisted settings via `chrome.storage.sync`

### `content.js` and processors

- Title extraction and normalization
- Query decision flow
- Fallback to generic links when no reliable match is found

## Link Generation Strategy

1. Try direct match from extracted title data
2. Build targeted search URL when direct match is uncertain
3. Fallback to generic CardTrader search flow if needed

## Token Configuration

1. Open extension settings
2. Paste CardTrader token
3. Enable advanced API mode
4. Save settings

Token handling notes:

- Token is stored in browser extension storage
- Avoid storing tokens in source files
- Never commit personal API credentials

## Failure Modes

- Rate limiting from upstream API
- Timeouts/network interruptions
- Incomplete title metadata for precise matching

Expected behavior in failures:

- Extension degrades to safe search/fallback links
- Core listing scanning should remain functional

## Maintenance Notes

- Keep docs aligned with existing files only.
- Remove references to non-existent wrappers/classes.
- Validate token flow whenever settings UI changes.