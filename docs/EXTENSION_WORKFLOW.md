# Extension Workflow

## Button Click Flow

1. Marketplace content scripts add a Pokoin button to supported listing pages.
2. Buttons are created immediately in a gray/loading state and still open the Chrome side panel. A resolved match is not required before the user can click.
3. When matches arrive, the button shows `Pokoin.com (N)`, where `N` is the count of matches above the high-confidence threshold. Vinted keeps the Pokoin brand blue in both empty and matched states.
4. Clicking any marketplace button opens the Chrome side panel for the current tab instead of opening a new browser tab.
5. The background service worker refreshes the side panel state for the sender tab.
6. The side panel embeds the Pokoin marketplace card page so the user's Pokoin login session stays inside the panel.
7. Marketplace processors use the background service worker as the reliable Cardvault search path. There is no active Supabase client, `config/supabase` module, or direct database lookup in the extension.
8. Button clicks always force a fresh side-panel loading state and resolve the clicked tab URL/title, avoiding stale candidates from previous pages.
9. Vinted, eBay, Cardmarket, and CardTrader all use this same button -> background refresh -> side panel render workflow.
10. Vinted passes selected item-description clues with preview searches and button clicks. Selected Pokemon-name-like clues are marked as primary clues, so the background service worker searches that clue first instead of noisy title/category fragments.
11. CardTrader card URLs already contain the Pokoin/CardTrader blueprint id, so CardTrader button clicks construct side-panel state immediately from the URL id and do not wait for page scraping, Cardvault name resolution, extension search, or autocomplete.
12. Direct CardTrader state stores a human card name for the side-panel header. The header keeps only the card name and variation, such as `Hypno` or `Gengar & Mimikyu GX`, and drops expansion/category/site suffixes from CardTrader titles and URL slugs.
13. CardTrader injects the Pokoin button as a real `type="button"` beside the card title and handles click events in capture phase. The handler prevents default page actions, stops propagation, ignores duplicate clicks while an open request is in flight, and sends a single side-panel message instead of letting CardTrader links/forms/navigation handlers react.
14. Cardmarket buttons are styled as compact inline controls in both gray and green states. Relabeling the button after matches are found reapplies the small Pokoin icon sizing so the raw icon asset cannot stretch across the product image area.
15. Vinted renders its Pokoin button, clue chips, and candidate preview in a compact transparent fixed overlay marked with `data-pokoin-extension-panel`. The overlay uses Shadow DOM when the browser supports it, with reset styles on the host and inside the shadow tree so Vinted page CSS cannot restyle the Pokoin controls.
16. Vinted processing is keyed by a stable listing URL that ignores query strings and hashes. Repeated `processProductPage()` calls, MutationObserver callbacks, and same-listing SPA rerenders reattach or reuse the existing owned root instead of creating another button, clue chip group, preview list, or background search.
17. Vinted starts preview search as soon as the item title and description are available. It does not wait for the final safe details anchor before sending `searchCardForTitle`.
18. Vinted preview searches are keyed by listing URL plus the selected clue signature. One in-flight search is shared for identical listing/clue inputs, stale responses are ignored, and cached results prevent identical repeated `searchCardForTitle` messages. Toggling a clue intentionally creates one new signature and runs exactly one new preview search.
19. When search results arrive before Vinted has finished loading the details anchor, the processor stores them by signature. The UI mounts later inside the safe detail container and immediately applies cached results without sending another search.
20. Each Vinted processing session records lightweight diagnostics on `window.__pokoinVintedDiagnostics`: stable listing key, search signature, trigger/reason, sequence id, duplicate skip reason, stale-response status, and anchor/UI mount status. These records are for debugging repeated same-page searches and avoid noisy per-selector console spam.

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
13. On Vinted pages, compact clue chips are extracted from the item title and description. Useful clues include real Pokemon-name-like terms such as `Reshiram`, collector numbers, promo codes, rarity/variation words, and known expansion names; generic marketplace words like `carta`, `carte`, `card`, and `cards` are never shown as chips and never sent as search clues. The common Italian typo `vastro` is normalized to `vstar` before clues, request titles, and structured variation parsing.
14. Vinted clue chips that validate as Pokemon names through the existing title/name resolver are selected by default and become the primary search title. Other useful but non-name-like clues still render as chips, but start off and only affect search after the user toggles them on.
15. Cardmarket product titles like `Camerupt (ASC 028)` are parsed as structured card data first: `Camerupt` is the card name, `028` is the collector number, and expansion/category text such as `Ascended Heroes - Singles` is only a secondary expansion clue. Name resolution and fallback autocomplete start from the structured card name instead of expansion breadcrumbs.
16. Side-panel refreshes always write a terminal state after Cardmarket scraping or search failures. Failures clear the loading state with empty candidates and an error message instead of leaving the panel stuck on the previous loading payload.

## Candidate Display Flow

1. Candidate rows show compact metadata only: collector/card number, expansion name, and Pokoin listing price when available. Vinted intentionally hides the card name in preview rows because it repeats the listing/search name.
2. Collector metadata shows only the first collector number:
   - `SVP 129` becomes `129`
   - `232/091` becomes `232`
   - `Holo Promo | XY92` becomes `92`
3. Expansion metadata shows an explicit Cardvault expansion code when available.
4. If no explicit expansion code exists, use the collector prefix such as `SVP` or `XY`.
5. If no useful prefix exists, derive initials from the expansion name.
6. If no compact shortname can be derived, show the expansion name.
7. Vinted's preview and the side panel can show up to eight candidates without a visible "Best candidates" heading. The Vinted preview is scrollable when candidates overflow and its rows are clickable side-panel openers.
8. Vinted scrapes title, description, and detail context from the product DOM, including `h1.web_ui__Text__title`, `[itemprop="description"]`, `[data-testid="item-page-summary-plugin"]`, `.box--item-details`, and related item-detail containers. That DOM is a data source only; the extension UI is not inserted into the product details/title block.
9. Vinted clue chips live inside the overlay and wrap naturally there. Pokemon-name-like chips start on; directly present variation chips such as `v`, `ex`, `gx`, `vmax`, and normalized `vastro` -> `vstar` also start on and are included in primary clue/search payloads. Other useful but non-name-like clues start off. Changing a chip re-runs the background search and updates the same blue button state and candidate preview list used by side-panel resolution.
10. Vinted keeps one overlay root per listing. A MutationObserver watches for Vinted SPA rerenders that remove the host, then reattaches the same fixed overlay without duplicating panels, searches, or losing the current button/chip/candidate state. Vinted-specific navigation watching detects true listing URL changes and resets the guard so the new listing renders and searches once.
11. The Vinted overlay sits at the lower-left viewport edge to avoid covering the listing content and remains isolated from Vinted CSS.
12. Expansion logos only decorate candidate rows when available. They do not reorder side-panel results; candidate order remains the order returned by the background/API ranking.
13. The background service worker enriches up to eight returned candidates with a cached lookup to `/api/cardtrader-redirect?id=:blueprintId` and reads the first formatted product listing price. Price lookup failures are ignored so candidate rendering is never blocked by marketplace inventory data.

## Processor Boundaries

Marketplace processors are responsible for page detection, button placement, lightweight preview UI, and sending `searchCardForTitle` / `openSidePanelForCurrentTab` messages. The background service worker owns Cardvault search, fallback autocomplete, and the canonical side-panel payload: `pageInfo`, `rows`, `best`, `blueprintId`, `pokoinUrl`, `error`, and debug metadata. Processors should not open Pokoin cards directly, should not depend on having a resolved candidate before wiring the side-panel click handler, and should not add direct Supabase/database lookups.

Some older content-script APIs still use database-era names such as `searchCardInDatabase` and return result objects with legacy field names like `blueprint_id` for processor compatibility. Those adapters now call Pokoin/Cardvault endpoints (`/api/extension-card-search` and `/api/marketplace-autocomplete`); they are not Supabase integration points.

eBay and Cardmarket processors attach the side-panel click handler as soon as the gray button is created, then only update visual state after matches arrive. Vinted additionally sends selected clue chips and primary Pokemon-name-like clues. CardTrader sends the blueprint id directly and lets the background service worker write a complete direct-card side-panel state.

The background `searchCardForTitle` path also de-dupes identical active requests by stable URL, title, and clue signature. This protects the backend if a content script and processor both send the same search, while still allowing manual side-panel refreshes and clue changes to resolve with fresh state when their inputs differ.

## CardTrader Direct Path

CardTrader was slower when the side panel opened because the background service worker still executed the generic page-title scraping path before it noticed the URL contained a blueprint id. The direct path now checks CardTrader URLs before injecting any page script or calling Cardvault APIs, writes the side-panel state with `source: cardtrader_url`, and opens the common side panel immediately.

When direct CardTrader state is rendered, the side panel treats it as a full card page view: candidates remain hidden, the embedded Pokoin card page fills the remaining panel space, and the header uses a clean card name from the page title, structured card data, or URL slug fallback. The same cleanup is used for direct CardTrader preview/search responses, so URL-like titles and verbose expansion/category/site suffixes never leak into the side-panel header or candidate payload.
