# Extension Workflow

## Button Click Flow

1. Marketplace content scripts add a Pokoin button to supported listing pages.
2. The button shows `Pokoin.com (N)`, where `N` is the count of matches above the high-confidence threshold.
3. Clicking the button opens the Chrome side panel for the current tab instead of opening a new browser tab.
4. The background service worker refreshes the side panel state for the sender tab.
5. The side panel embeds the Pokoin marketplace card page so the user's Pokoin login session stays inside the panel.
6. If a marketplace content script cannot fetch Cardvault results directly, it asks the background service worker to run the same resolver so the button can still update without logging expected page-context fetch failures as extension errors.
7. Button clicks always force a fresh side-panel loading state and resolve the clicked tab URL/title, avoiding stale candidates from previous pages.
8. Vinted, eBay, Cardmarket, and CardTrader all use this same button -> background refresh -> side panel render workflow.
9. Vinted passes selected item-description clues with preview searches and button clicks. Selected Pokemon-name-like clues are marked as primary clues, so the background service worker searches that clue first instead of noisy title/category fragments.
10. CardTrader card URLs already contain the Pokoin/CardTrader blueprint id, so CardTrader button clicks construct side-panel state immediately from the URL id and do not wait for page scraping, Cardvault name resolution, extension search, or autocomplete.
11. Direct CardTrader state stores a human card name for the side-panel header. If CardTrader only provides a URL-like title, the extension derives the name from the card URL slug instead of showing the long `cardtrader.com/...` path.
12. Cardmarket buttons are styled as compact inline controls in both gray and green states. Relabeling the button after matches are found reapplies the small Pokoin icon sizing so the raw icon asset cannot stretch across the product image area.

## Match Resolution Flow

1. The content script or side panel scrapes the marketplace title.
2. Local cleanup removes marketplace noise such as `pokemon`, `pokémon`, `carta`, `carte`, `card`, `cards`, `sealed`, `salead`, `pack`, `booster`, `lot`, `first edition`, `prima edizione`, and `1 edizione`.
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
13. On Vinted pages, compact clue chips are extracted from the item title and description. Useful clues include real Pokemon-name-like terms such as `Reshiram`, collector numbers, promo codes, rarity/variation words, and known expansion names; generic marketplace words like `carta`, `carte`, `card`, and `cards` are never shown as chips and never sent as search clues.
14. Vinted clue chips that validate as Pokemon names through the existing title/name resolver are selected by default and become the primary search title. Other useful but non-name-like clues still render as chips, but start off and only affect search after the user toggles them on.
15. Cardmarket product titles like `Camerupt (ASC 028)` are parsed as structured card data first: `Camerupt` is the card name, `028` is the collector number, and expansion/category text such as `Ascended Heroes - Singles` is only a secondary expansion clue. Name resolution and fallback autocomplete start from the structured card name instead of expansion breadcrumbs.
16. Side-panel refreshes always write a terminal state after Cardmarket scraping or search failures. Failures clear the loading state with empty candidates and an error message instead of leaving the panel stuck on the previous loading payload.

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
7. Vinted's in-page preview and the side panel can show up to eight candidates without a visible "Best candidates" heading.
8. Vinted renders the Pokoin button and clue chips inside one compact panel inserted into the item details/title column, before the listing action area when Vinted exposes one. The chips wrap naturally inside that normal page container, so they do not float over the product images, title, details, or right-side content. Pokemon-name-like chips start on; non-name-like chips start off. Changing a chip re-runs the background search and updates the same green button state and candidate preview list used by side-panel resolution.
9. Vinted uses a fixed fallback panel only when no safe item title/details anchor exists. That fallback sits at the lower-left viewport edge instead of the upper-right product/sidebar area to avoid covering the listing content.

## CardTrader Direct Path

CardTrader was slower when the side panel opened because the background service worker still executed the generic page-title scraping path before it noticed the URL contained a blueprint id. The direct path now checks CardTrader URLs before injecting any page script or calling Cardvault APIs, writes the side-panel state with `source: cardtrader_url`, and opens the common side panel immediately.

When direct CardTrader state is rendered, the side panel treats it as a full card page view: candidates remain hidden, the embedded Pokoin card page fills the remaining panel space, and the header uses a clean card name from the page title, structured card data, or URL slug fallback.
