# Extension Workflow

## Button Click Flow

1. Marketplace content scripts add a Pokoin button to supported listing pages.
2. The button shows `Pokoin.com (N)`, where `N` is the count of matches above the high-confidence threshold.
3. Clicking the button opens the Chrome side panel for the current tab instead of opening a new browser tab.
4. The background service worker refreshes the side panel state for the sender tab.
5. The side panel embeds the Pokoin marketplace card page so the user's Pokoin login session stays inside the panel.
6. If a marketplace content script cannot fetch Cardvault results directly, it asks the background service worker to run the same resolver so the button can still update.
7. Button clicks always force a fresh side-panel loading state and resolve the clicked tab URL/title, avoiding stale candidates from previous pages.

## Match Resolution Flow

1. The content script or side panel scrapes the marketplace title.
2. Local cleanup removes marketplace noise such as `pokemon`, `pokémon`, `sealed`, `salead`, `pack`, `booster`, `lot`, `first edition`, `prima edizione`, and `1 edizione`.
3. Expansion aliases are preserved as structured expansion fields before name cleanup; for example Italian `set base` maps to `Base Set`.
4. Candidate title terms are checked through Cardvault autocomplete.
5. A candidate name is accepted only when Cardvault returns an exact `canonical_name` or `name` match from the backend name tables.
6. The resolved name is sent to `/api/extension-card-search`.
7. Returned matches are accepted only if the returned card name still matches the resolved structured name.
8. If structured search returns no accepted rows, the extension falls back to marketplace autocomplete.
9. CardTrader card pages are supported directly: when the URL contains `/cards/:id`, that CardTrader blueprint id is used as the Pokoin card id without running search.
10. Plain `Nidoran` is treated as a special ambiguous name: keep both male and female candidates visible, and use expansion/collector evidence to rank the best one.
11. First-edition wording is a local ordering hint, not a hard expansion filter: boost the Base Set family (`Base Set`, `Base Set 2`, `Base Set Shadowless`) first, but keep newer Japanese/modern edition candidates available afterward.
12. Variation text such as `V`, `ex`, `VMAX`, and `VSTAR` is preserved in the Cardvault search name so the side panel uses the same more-specific matching behavior as the injected button.

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
7. Vinted's in-page preview and the side panel can show up to eight candidates under the `Pokoin.com` button / Best candidates section.
