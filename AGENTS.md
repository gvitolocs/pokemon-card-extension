<!-- codevira:begin (auto-generated; do not edit) -->

## Codevira-tracked project memory: pokemon-card-extension

> **Codevira** — cross-IDE persistent memory. Read it with the codevira MCP tools (`get_session_context`, `search_decisions`); do **not** open `.codevira/*.jsonl` directly — those files are large and token-heavy.

### Locked decisions (do_not_revert)

- **D000006** [supersedes D000005: Awaiting identify to completion blocked overlay preview-ready and left loading:true while Vinted C…  ·  `config/background.js`  ·  _extension, pipeline, scan_
- **D000009** Vinted listing identify reads gallery imgs from item-photo-N--img, not only og:image and not seller thumbs.  ·  `utils/ListingScan.js`  ·  _extension, pipeline, scan, vinted_
- **D00000A** Cardvault HTTP 400 is a payload/query bug on the existing search hops: omit empty fields, do not send LV as collector, …  ·  `config/background.js`  ·  _cardvault, extension, pipeline, search_
- **D00000B** Bump the manifest patch version on every rebuild and show that version in the overlay and side panel so a Reload is vis…  ·  `manifest.json`  ·  _extension, release, ui_
- **D00000C** Listing identify album-view is max YOLO boxes on one photo; a front+back singles gallery keeps the highest-score top1 a…  ·  `utils/ListingScan.js`  ·  _album, extension, pipeline, scan_
- **D00000I** [supersedes D00000H: User asked to remove the extension-side 8 cap. Raising identify top_k above 8 still 422s. Uncap li…  ·  `config/background.js`  ·  _album, extension, pipeline, scan, ui_
- **D00000K** Rebuild the album Milo gallery by re-exporting existing 128-d vectors filtered to marketplace item_kind=single and prod…  ·  `scripts/catalog-metadata.cjs`  ·  _album, cardscan, milo, pipeline_
- **D00000N** [supersedes D00000J: Marketplace /scan and leftover-JPEG catalogs shipped 2026-09-05. pokemon_western still has product…  ·  `config/background.js`  ·  _album, extension, milo, pipeline, scan_
- **D00000P** [supersedes D00000L: /identify-album is live (422 without file, 200 with file). An 8s probe would cut off real album sc…  ·  `config/background.js`  ·  _extension, pipeline, scan, ui, vinted_
- **D00000S** Qwen 3.8 27B labels leftover JPEG printings reprint vs alt from the local nezopt gallery; never merge public_ids and do…  ·  `scripts/artwork-lang-pipeline.py`  ·  _cardtrader, extension, leftover, pipeline, qwen_
- **D00000T** [supersedes D00000Q: Grouping every marketplace row named Espurr treated Flashfire and Nihil Zero as one versions tab. …  ·  `docs/CARDTRADER_MODEL.md`  ·  _cardtrader, extension, pipeline, versions_
- **D00000U** Desk versions use pokoin_version_sets plus marketplace_search_candidates.version as a group key; never store sibling id…  ·  `scripts/pokoin-version-sets.sql`  ·  _cardtrader, pipeline, raspberry, versions_
- **D00000V** Best Deal Silver tools paint from localStorage pokoin.auth.session (Flutter cachedProfile) so a logged-in Silver sessio…  ·  `market/src/auth.jsx`  ·  _auth, extension, pipeline, ui_
- **D00000X** Never show Blank Filler Card in overlay, side panel, or scan rows.  ·  `utils/ListingScan.js`  ·  _album, extension, scan, ui_
- **D000014** Overlay clue chips keep unique single words from listing text; drop overlapping title n-grams; keep multi-word chips on…  ·  `processors/VINT.js`  ·  _chips, extension, ui, vinted_
- **D000015** Overlay ALL reuses cached overlay preview rows and only clears selectedCandidateId/openPokoinDesk so the leftover tile …  ·  `config/background.js`  ·  _album, cache, extension, ui, vinted_
- **D000017** Add Pokemon Card Back as a Milo pokemon_generic catalog embed and ignore it like Blank Filler; prefer identify-album ma…  ·  `utils/ListingScan.js`  ·  _album, cardback, extension, pipeline, scan_
- **D000018** Fine-tune cardscan pokemon_generic with multiple Pokemon Card Back photo variants and prefer item_kind=card_back in Mil…  ·  `/home/nez/Projects/BattleScan/server/app.py`  ·  _cardback, cardscan, milo, pipeline, pokemon_generic_
- **D00001B** Collapsed Vinted overlay shrinks the Pokoin control to a 40x40 icon-only button with no match label and hides the X/+ t…  ·  `processors/VINT.js`  ·  _extension, overlay, ui, vinted_
- **D00001C** Album tiles derive _homepage.webp from the leftover JPEG stem (ct_id + leftover slug), same as marketplace homepageDeri…  ·  `ui-pages/sidepanel.js`  ·  _album, extension, leftover, ui_
- **D00001E** [supersedes D00000D: Giuseppe typed koraidon on a two-card Koraidon ex Vinted listing. BattleScan logged the same ~0.50…  ·  `processors/VINT.js`  ·  _chips, extension, pipeline, scan, search, vinted_
- **D00001F** [supersedes D00000E: The koraidon typed chip re-posted the same identify-album lookalikes from tokens-ready plus search…  ·  `config/background.js`  ·  _extension, pipeline, scan, search, vinted_
- **D00001H** CardTrader page URLs map to Pokoin desk as public_id = ct_id * 2. Never double identify or Cardvault card_id.  ·  `config/background.js`  ·  _cardtrader, extension, pipeline, ui_
- **D00001I** The collapsed 40x40 Pokoin button is itself the drag handle: host pointer-events auto, no panel margin, immediate point…  ·  `processors/VINT.js`  ·  _extension, overlay, ui, vinted_
- **D00001J** eBay overlay applies identify lookalikes via pokoinListingScanMerged; Porygon2 is a name clue and Cardvault retries the…  ·  `processors/EBAYE.js`  ·  _cardvault, ebay, extension, pipeline, scan_
- **D00001K** Hide overlay ALL when there is only one match. Two or more rows still start with ALL.  ·  `processors/VINT.js`  ·  _extension, overlay, ui, vinted_
- **D00001L** eBay overlay publishes tokens-ready like Vinted; chip click Cardvault-searches without a new identify; typed Add clue r…  ·  `processors/EBAYE.js`  ·  _ebay, extension, pipeline, scan, ui_
- **D00001M** eBay overlay uses the same Vinted dashboard chrome: header plus X, 320px shell, 40x40 collapse, and named candidate row…  ·  `processors/EBAYE.js`  ·  _ebay, extension, overlay, ui, vinted_
- **D00001Q** [supersedes D00000W: User saw EN SM133 on the versions page while the side panel chose CN CSMPi 005. Keeping the identi…  ·  `utils/PrintLangs.js`  ·  _album, cardtrader, extension, leftover, ui_
- **D00001S** [supersedes D00001R: User opened CS4a Chinese printings and every tile had EUR pressed with CN grayed out. Those leftov…  ·  `utils/PrintLangs.js`  ·  _album, extension, leftover, ui_
- **D00001U** Album leftover tiles label collector and expansion from the selected leftover slug. EUR Evolving Skies is 095 · ES, not…  ·  `utils/PrintLangs.js`  ·  _album, extension, leftover, ui_
- **D00001V** Leftover tiles do not paint print-langs.v name-wide version counts; desk View all N versions is the CardTrader lineage.  ·  `ui-pages/sidepanel.js`  ·  _album, extension, leftover, ui, versions_
- **D00001W** Album leftover tiles overlay a red X to hide that card on this listing for 3 days, and a heart that POSTs /api/marketpl…  ·  `ui-pages/sidepanel.js`  ·  _album, extension, ui, vinted, wishlist_
- **D00001X** [supersedes D00001T: Desk versions label the western printing EN, not EUR. User pointed at Rampardos EN while leftover …  ·  `utils/PrintLangs.js`  ·  _album, extension, leftover, ui_
- **D000020** The side panel hydrates data/print-langs.json so leftover tiles can resolve leftover JPEG stems when overlay rows omit …  ·  `ui-pages/sidepanel.js`  ·  _album, extension, leftover, ui_
- **D000024** Vinted overlay, Cardvault search, and listing identify run only on vinted.*/items/{id} product URLs. Catalogo, homepage…  ·  `processors/VINT.js`  ·  _extension, pipeline, scan, vinted_
- **D000025** Backfill empty leftover JPEG cdn URLs from the local gallery into pokemon_generic, and link JP/EN reprints with mutual …  ·  `scripts/artwork-lang-pipeline.py`  ·  _cardscan, extension, leftover, pipeline, pokemon_generic_
- **D000026** Album leftover hide and heart stay on each tile artwork; they never paint over the sticky side-panel header.  ·  `ui-pages/sidepanel.css`  ·  _album, extension, overlay, ui_
- **D000027** Vinted and eBay overlays keep the reduced 40x40 icon across listing navigation until the user clicks it to expand. Coll…  ·  `processors/VINT.js`  ·  _ebay, extension, overlay, ui, vinted_
- **D000028** Leftover tiles and overlay prices use GET /api/marketplace-card-last-median for the last UTC-day median sold PKN of tha…  ·  `config/background.js`  ·  _extension, leftover, pipeline, price, ui_
- **D000029** When CLIP leaves eur empty, uniquely link JP/CN leftover tiles to the same-illustration western leftover with equalized…  ·  `scripts/artwork-lang-pipeline.py`  ·  _album, cardtrader, extension, leftover, pipeline, ui_
- **D00002A** Japanese-only leftovers press JP, not EN, when there is no western leftover public_id.  ·  `utils/PrintLangs.js`  ·  _album, extension, jp, leftover, ui_
- **D00002B** Collapse album leftover tiles that share leftover pack ids, leftover JPEG slug, or leftover collector+expansion label o…  ·  `utils/PrintLangs.js`  ·  _album, extension, leftover, overlay, ui_
- **D00002C** The side-panel title row shows the gold last-median PKN total of visible leftover tiles next to N cards; hiding a tile …  ·  `ui-pages/sidepanel.html`  ·  _album, extension, leftover, price, ui_
- **D00002E** Vinted and eBay overlay candidate rows paint last-median PKN in coin gold next to the card name.  ·  `processors/EBAYE.js`  ·  _ebay, extension, overlay, price, ui, vinted_
- **D00002H** Drop identify uniqueHits with Milo score 0.50 or less from overlay and leftover tiles.  ·  `utils/ListingScan.js`  ·  _album, extension, pipeline, scan, ui_
- **D00002I** On singles listings, overlay name chips come from the item title only; drop description-only Pokemon names and grading …  ·  `processors/VINT.js`  ·  _chips, ebay, extension, ui, vinted_
- **D00002J** Side-panel gold PKN next to N cards sums leftover row last-medians when tile price nodes are still empty, and last-medi…  ·  `ui-pages/sidepanel.js`  ·  _album, extension, leftover, price, ui_
- **D00002K** Leftover PKN fetches retry api.pokoin.com and marketplace-card-sales lastMedianPkn when pokoin.com last-median is Cloud…  ·  `config/background.js`  ·  _extension, leftover, pipeline, price_
- **D00002L** Chrome extension JSON APIs use https://api.pokoin.com. pokoin.com stays for desk pages. Free Bot Fight on the apex host…  ·  `config/background.js`  ·  _extension, pipeline, price_
- **D00002N** [supersedes D00002M: User asked leftover-embed not even when clicking one overlay row in a multi-card album; that click…  ·  `ui-pages/sidepanel.js`  ·  _album, extension, leftover, overlay, ui, vinted_
- **D00002P** [supersedes D000023: Leftover-embed after overlay row click is retired. UniqueHits still stay the grid until the user c…  ·  `config/background.js`  ·  _album, extension, pipeline, ui, vinted_
- **D00002R** [supersedes D000010: Leftover full-card JPEG embed is no longer a side-panel view. Art-cut still applies to album tiles…  ·  `ui-pages/sidepanel.css`  ·  _album, extension, leftover, ui_
- **D00002T** [supersedes D00002D: Idle Open a listing copy blocked scanning a visible catalog grid. User asked to replace Refresh wi…  ·  `ui-pages/sidepanel.js`  ·  _album, extension, scan, ui, vinted_
- **D00002U** [supersedes D000019: User does not want chips selected by default. Auto-selecting a description collector or Pikachu/il…  ·  `processors/VINT.js`  ·  _chips, ebay, extension, overlay, vinted_
- **D00002V** [supersedes D00002G: Lotto JP uniqueCount stayed 1 because 2-5 box extras still used the 0.80 closeup gate. Those group…  ·  `utils/ListingScan.js`  ·  _album, extension, pipeline, scan, vinted_
- **D00002W** [supersedes D00002S: User asked the reduced icon to open the side panel when it is missing, and the expanded Pokoin.com…  ·  `processors/VINT.js`  ·  _ebay, extension, overlay, pipeline, scan, vinted_
- **D00002X** [supersedes D00001G: User asked the reduced 40x40 icon to remember screen coordinates; snapping to left/right 12px made…  ·  `processors/VINT.js`  ·  _ebay, extension, overlay, ui, vinted_
- **D000031** [supersedes D000003: User asked to implement card recognition in the extension with hardware acceleration and bundle YO…  ·  `config/background.js`  ·  _extension, pipeline, scan, yolo_
- **D000032** [supersedes D00000R: Bundled on-device scan replaces the mandatory remote identify-album hop. Album uniqueHits merge ru…  ·  `config/background.js`  ·  _album, extension, pipeline, scan_
- **D000033** Mewtwo Evolutions public_id 236804 and JP Expansion Pack printing 276178 are a reviewed same-art language pair; keep th…  ·  `scripts/artwork-lang-pipeline.py`  ·  _extension, jp, leftover, ui_
- **D000035** [supersedes D000034: Chrome still emitted JSEP/WebGPU ONNX session-assignment logs even when JavaScript caught the fail…  ·  `scan/offscreen.js`  ·  _extension, local-only, privacy, release, scan, wasm_
- **D000038** Current-tab screenshots classify album versus singles from distinct recognized Milo hits, ignore raw YOLO box count fro…  ·  `config/background.js`  ·  _extension, pipeline, scan, ui, viewport_
- **D000039** Meowstic BREAKpoint public_id 220966 is reviewed same artwork with Japanese printing public_id 642866 and must remain l…  ·  `scripts/artwork-lang-pipeline.py`  ·  _extension, jp, leftover, pipeline, versions_
- **D00003A** The extension print-language index imports every cross-language illustration lineage from marketplace_search_candidates…  ·  `scripts/artwork-lang-pipeline.py`  ·  _cardtrader, extension, jp, pipeline, versions_
- **D00003B** [supersedes D000037: The loaded v3.0.22 RC15 Meowstic screenshot proved that YOLO can emit a weak false box on the exte…  ·  `config/background.js`  ·  _extension, pipeline, scan, ui, yolo_
- **D00003E** [supersedes D00003D: The diagnosis is now implemented and verified; this replacement records the required wire format, …  ·  `config/background.js`  ·  _chrome, extension, local-only, release, scan, serialization_
- **D00003F** Scan visible tab is a multi-card surface: preserve every distinct Milo-recognized hit from the captured viewport, ignor…  ·  `config/background.js`  ·  _extension, local-only, logging, scan, ui, viewport_
- **D00003G** Side-panel candidate tiles await bundled print-langs hydration before first render. A language pack with a CardTrader p…  ·  `ui-pages/sidepanel.js`  ·  _extension, hydration, jp, print-langs, sidepanel, ui_
- **D00003H** Vinted unpressed title chips still encode exact title name, full collector fraction, and expansion for listing scans; s…  ·  `config/background.js`  ·  _extension, pipeline, scan, threshold, vinted_
- **D00003I** Side-panel leftover and CDN card art loads with crossorigin=anonymous so COEP require-corp does not blank tiles. Keep W…  ·  `ui-pages/sidepanel.js`  ·  _album, coep, extension, leftover, ui_
- **D00003J** Vinted and eBay overlay Pokoin button is red while a listing scan is in flight and green when match results are ready; …  ·  `processors/VINT.js`  ·  _ebay, extension, overlay, scan, ui, vinted_
- **D00003K** When the side panel is open, listing scan starts even if the overlay stays collapsed; persist open vs closed so navigat…  ·  `config/background.js`  ·  _extension, overlay, pipeline, scan, ui, vinted_
- **D00003O** A single leftover tile uses a one-column side-panel grid so it fills the panel instead of sitting in the left half of t…  ·  `ui-pages/sidepanel.js`  ·  _album, extension, scan, ui, viewport_
- **D00003Q** [supersedes D00003P: User rejected the new-tab Open Pokoin page workaround. They want the Pokoin desk rendered in the e…  ·  `ui-pages/sidepanel.js`  ·  _album, cardtrader, ebay, extension, overlay, ui, vinted_
- **D00003S** [supersedes D00003N: User wants overlay row focus to show the Pokoin desk in the side panel, not a leftover tile or a n…  ·  `ui-pages/sidepanel.js`  ·  _album, extension, overlay, ui, vinted_
- **D00003T** Set pages put a CardTrader-like search, sort, grid/list toggle, and Language/Rarity/Reverse/First edition/Listed filter…  ·  `/home/nez/Projects/pokoin-web/market/src/pages/Expansion.jsx`  ·  _cardtrader, extension, pipeline, ui, vinted_
- **D00003U** Bundle Pokemon Card Back Milo vectors into the western on-device catalog and ignore those hits like Blank Filler so Aip…  ·  `scripts/bundle-ondevice-scan.py`  ·  _album, cardback, extension, milo, pipeline, scan_
- **D00003V** Front+back singles keep one leftover tile: album-view is max boxes on one photo, and 1-box extras below 0.80 collapse e…  ·  `utils/ListingScan.js`  ·  _album, extension, pipeline, scan, ui_
- **D00003W** A late listing-scan or last-median hop must not expand a 1-row side panel into two leftover tiles; prices fill existing…  ·  `config/background.js`  ·  _album, cache, extension, pipeline, price, ui_
- **D00003X** applyWesternEmbed merges live marketplace-version-set print_langs with bundled print-langs.json; a live JP/CN pack is k…  ·  `utils/PrintLangs.js`  ·  _album, extension, jp, print-langs, sidepanel, ui_
- **D00003Y** [supersedes D00002Z: Chrome Web Store draft 12.0.20 sat in review more than 24h because of all_urls. Giuseppe asked Sca…  ·  `manifest.json`  ·  _chrome, ebay, extension, scan, ui, vinted_
- **D00003Z** The credentialless side-panel Pokoin desk receives the extension auth session via postMessage; Firebase null in that fr…  ·  `ui-pages/sidepanel.js`  ·  _auth, extension, overlay, ui, vinted_
- **D000040** Scan tab viewport leftover tiles stay on the same listing URL; a later listing identify must not replace them.  ·  `config/background.js`  ·  _album, cache, extension, scan, ui, vinted_
- **D000041** Cardvault fetch must not retry AbortError; the 6s timeout is terminal for that attempt.  ·  `config/background.js`  ·  _extension, pipeline, search_
- **D000042** Singles listing scan does not copy Milo top1 name or collector below score 0.65.  ·  `config/background.js`  ·  _extension, pipeline, scan, threshold_
- **D000043** Open-panel listing identify uses this item's gallery photos from item-photo imgs and __NEXT_DATA__ for /items/{id}, the…  ·  `processors/VINT.js`  ·  _album, extension, pipeline, scan, ui, vinted_
- **D000044** Credentialless Pokoin desk hydrates Silver and site PKN from Firestore REST using the extension ID token; Firebase null…  ·  `/home/nez/Projects/pokoin-web/market/src/auth.jsx`  ·  _auth, extension, pipeline, ui_
- **D000045** Scan tab captures CardTrader and Cardmarket visible photos from the page MAIN world; Cardmarket /Products/Singles/{expa…  ·  `config/background.js`  ·  _cardmarket, cardtrader, extension, pipeline, scan, ui_
- **D000046** Cardmarket listing identify runs only on /Products/Singles/{expansion}/{card} product URLs; catalog, search, and expans…  ·  `processors/CME.js`  ·  _cardmarket, extension, pipeline, scan_
- **D000047** Unhide the side-panel desk iframe before assigning src, and force a visible reload after a hide so Chrome paints pokoin…  ·  `ui-pages/sidepanel.js`  ·  _cardtrader, extension, overlay, ui, vinted_
- **D000048** Vinted overlay, content scripts, host_permissions, and web_accessible_resources list every country marketplace host inc…  ·  `manifest.json`  ·  _extension, manifest, overlay, vinted_
- **D000049** The credentialless Pokoin desk iframe adds pokoin_embed=1 so the SPA talks to api.pokoin.com, uses in-memory Firebase p…  ·  `ui-pages/sidepanel.js`  ·  _auth, cardtrader, extension, overlay, ui, vinted_
- **D00004A** Listing auto-identify fetches marketplace photos in the service worker and sends JSON-safe {base64,type} into the COEP …  ·  `config/background.js`  ·  _coep, extension, pipeline, scan, vinted_
- **D00004B** Automatic listing identify YOLO-runs every gallery photo: crop visible item-photo imgs from the tab screenshot, fetch r…  ·  `config/background.js`  ·  _album, extension, pipeline, scan, vinted_
- **D00004C** Framed Best Deal CT/CM/VT clicks open a real Chrome tab via chrome.tabs.create; even Pokoin public_id maps to CardTrade…  ·  `config/background.js`  ·  _cardtrader, extension, overlay, ui, vinted_
- **D00004D** Desk iframe stays credentialless with no allow=popups; inject the auth session only after the iframe has left about:bla…  ·  `ui-pages/sidepanel.js`  ·  _auth, extension, overlay, ui, vinted_
- **D00004E** CardTrader singles black side panel is caused by api.pokoin.com /api/marketplace-card-url missing Access-Control-Allow-…  ·  `/Users/giuseppe/mnt/nezopt/Projects/cardvault/pokemon_card_vault-home-availability-deploy/pokemon_card_vault/api/marketplace-card-url.js`  ·  _api, cardtrader, cardvault, cors, desk, extension_

### Active conventions

_+3 more decision(s) — full log in `.codevira/decisions.jsonl`._


For the full decision log, use `search_decisions` / `list_decisions` (or the `codevira` CLI) — don't read `.codevira/*.jsonl` directly.

<!-- codevira:end -->
