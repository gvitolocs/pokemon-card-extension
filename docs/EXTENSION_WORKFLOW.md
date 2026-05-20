# Extension Workflow

## Button Click Flow

1. Marketplace content scripts add a Pokoin button to supported listing pages.
2. The button shows `Pokoin (N)`, where `N` is the count of matches above the high-confidence threshold.
3. Clicking the button opens the Chrome side panel for the current tab instead of opening a new browser tab.
4. The background service worker refreshes the side panel state for the sender tab.
5. The side panel embeds the Pokoin marketplace card page so the user's Pokoin login session stays inside the panel.

## Match Resolution Flow

1. The content script or side panel scrapes the marketplace title.
2. Local cleanup removes marketplace noise such as `pokemon`, `pokémon`, `sealed`, `salead`, `pack`, `booster`, and `lot`.
3. Candidate title terms are checked through Cardvault autocomplete.
4. A candidate name is accepted only when Cardvault returns an exact `canonical_name` or `name` match from the backend name tables.
5. The resolved name is sent to `/api/extension-card-search`.
6. Returned matches are accepted only if the returned card name still matches the resolved structured name.
7. If structured search returns no accepted rows, the extension falls back to marketplace autocomplete.

## Candidate Display Flow

1. Candidate rows show the card name and compact metadata.
2. Collector metadata shows only the first collector number:
   - `SVP 129` becomes `129`
   - `232/091` becomes `232`
   - `Holo Promo | XY92` becomes `92`
3. Expansion metadata shows an explicit Cardvault expansion code when available.
4. If no explicit expansion code exists, use the collector prefix such as `SVP` or `XY`.
5. If no useful prefix exists, derive initials from the expansion name.
6. If no compact shortname can be derived, show the expansion name.
