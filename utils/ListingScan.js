/**
 * ListingScan.js
 * Shared Vinted/eBay listing-kind classification and bundled identify helpers.
 * Text kind is decided from raw title/description before marketplace noise stripping.
 * Scan box/hit counts corroborate album views. Singles lookalike hits are the
 * candidate pool; selected chips rank that pool. They do not replace YOLO box counts.
 */

const CARDSCAN_IDENTIFY_MIN_SCORE = 0.50;
const CARDSCAN_ALBUM_EXTRA_MIN_SCORE = 0.80;
const CARDSCAN_ALBUM_DENSE_BOX_COUNT = 6;
const LISTING_SCAN_MAX_PHOTOS = 4;
const LISTING_SCAN_MAX_BYTES = 2.5 * 1024 * 1024;

function listingScanText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function listingScanCompact(value = '') {
    return listingScanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const VINTED_ITEM_LISTING_PATH = /(?:^|\/)items\/\d+/i;

function isVintedItemListingUrl(url = '') {
    try {
        const parsed = new URL(String(url || ''), typeof location !== 'undefined' ? location.href : undefined);
        if (!parsed.hostname.toLowerCase().includes('vinted')) {
            return false;
        }
        return VINTED_ITEM_LISTING_PATH.test(parsed.pathname);
    } catch (_) {
        return /vinted\.[^/?#]+\/(?:[a-z]{2}\/)?items\/\d+/i.test(String(url || ''));
    }
}

const CARDMARKET_SINGLES_PRODUCT_PATH = /\/Products\/Singles\/[^/]+\/[^/]+/i;

function isCardmarketSinglesProductUrl(url = '') {
    try {
        const parsed = new URL(String(url || ''), typeof location !== 'undefined' ? location.href : undefined);
        if (!parsed.hostname.toLowerCase().includes('cardmarket')) {
            return false;
        }
        const parts = parsed.pathname.split('/').filter(Boolean);
        const singles = parts.findIndex((part) => /^Singles$/i.test(part));
        return singles >= 0 && Boolean(parts[singles + 1] && parts[singles + 2]);
    } catch (_) {
        return CARDMARKET_SINGLES_PRODUCT_PATH.test(String(url || ''));
    }
}

function isVintedQuietUrl(url = '') {
    try {
        const parsed = new URL(String(url || ''), typeof location !== 'undefined' ? location.href : undefined);
        if (!parsed.hostname.toLowerCase().includes('vinted')) {
            return false;
        }
        return !VINTED_ITEM_LISTING_PATH.test(parsed.pathname);
    } catch (_) {
        return /vinted\./i.test(String(url || '')) && !isVintedItemListingUrl(url);
    }
}

function isIgnoredListingCard(card = {}) {
    if (String(card.item_kind || card.itemKind || '') === 'card_back') {
        return true;
    }
    const publicId = listingScanText(card.public_id || card.publicId || card.id || '');
    if (publicId.toLowerCase().startsWith('pokemon-card-back')) {
        return true;
    }
    const compact = listingScanCompact(
        card.name || card.name_en || card.card_name || card.cardName || ''
    );
    if (!compact) {
        return false;
    }
    return compact.includes('blankfillercard')
        || compact.includes('pokemoncardback')
        || compact === 'cardback';
}

function listingQuantityFromText(text = '') {
    const source = listingScanText(text);
    const match = source.match(/\b(\d{1,3})\s*(?:carte|cards|card)\b/i) ||
        source.match(/\b(?:lot(?:to)?|bundle|set)\s*(?:da|di|of)?\s*(\d{1,3})\b/i);
    const quantity = Number(match?.[1] || 0);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function classifyMarketplaceListingKindFromText(title = '', description = '') {
    const source = `${listingScanText(title)} ${listingScanText(description)}`.trim();
    if (!source) {
        return {
            kind: 'unknown',
            quantity: 0,
            albumKeywords: [],
            singlesKeywords: [],
            reason: 'empty-text',
        };
    }

    const albumKeywordPatterns = [
        { label: 'album', pattern: /\balbum(?:i|s)?\b/i },
        { label: 'binder', pattern: /\bbinder(?:s)?\b/i },
        { label: 'raccoglitore', pattern: /\braccoglitor[ei]\b/i },
        { label: 'lotto', pattern: /\blott[oi]\b|\blot\b/i },
        { label: 'bundle', pattern: /\bbundle(?:s)?\b/i },
        { label: 'pagina', pattern: /\bpagin[ae]\b|\bfogli(?:o)?\b|\bbinder\s+page\b/i },
        { label: 'set-completo', pattern: /\bset\s+complet[oaie]?\b|\bcomplete\s+set\b/i },
    ];
    const singlesKeywordPatterns = [
        { label: 'singola', pattern: /\bsingol[aeoi]\b|\bsingles?\b/i },
        { label: 'una-carta', pattern: /\b(?:1|una|one)\s+cart[ae]\b|\bone\s+card\b/i },
    ];
    const sealedKeywordPatterns = [
        { label: 'sealed', pattern: /\b(?:sealed|sigillat[aoe]?|booster|etb|elite\s+trainer)\b/i },
    ];

    const albumKeywords = albumKeywordPatterns
        .filter(({ pattern }) => pattern.test(source))
        .map(({ label }) => label);
    const singlesKeywords = singlesKeywordPatterns
        .filter(({ pattern }) => pattern.test(source))
        .map(({ label }) => label);
    const sealedKeywords = sealedKeywordPatterns
        .filter(({ pattern }) => pattern.test(source))
        .map(({ label }) => label);
    const quantity = listingQuantityFromText(source);
    const hasAlbumKeyword = albumKeywords.length > 0;
    const hasSinglesKeyword = singlesKeywords.length > 0;

    if (sealedKeywords.length > 0 && !hasAlbumKeyword && quantity < 2) {
        return {
            kind: 'unknown',
            quantity,
            albumKeywords,
            singlesKeywords,
            sealedKeywords,
            reason: 'sealed-product',
        };
    }
    if (hasAlbumKeyword) {
        return {
            kind: 'album',
            quantity,
            albumKeywords,
            singlesKeywords,
            sealedKeywords,
            reason: 'album-keyword',
        };
    }
    if (quantity >= 2 && (hasAlbumKeyword || /\b(?:carte|cards)\b/i.test(source))) {
        return {
            kind: 'album',
            quantity,
            albumKeywords,
            singlesKeywords,
            sealedKeywords,
            reason: quantity >= 2 ? 'multi-card-quantity' : 'album-keyword',
        };
    }
    if (hasSinglesKeyword && quantity <= 1) {
        return {
            kind: 'singles',
            quantity: quantity || 1,
            albumKeywords,
            singlesKeywords,
            sealedKeywords,
            reason: 'singles-keyword',
        };
    }
    return {
        kind: 'unknown',
        quantity,
        albumKeywords,
        singlesKeywords,
        sealedKeywords,
        reason: 'no-strong-text-signal',
    };
}

function classifyMarketplaceListingKind({
    title = '',
    description = '',
    photoCount = 0,
    boxCount = 0,
    uniqueHitCount = 0,
    textKind = '',
} = {}) {
    const textClassification = (textKind === 'album' || textKind === 'singles')
        ? { kind: textKind, reason: 'payload-text-kind', quantity: 0, albumKeywords: [], singlesKeywords: [] }
        : classifyMarketplaceListingKindFromText(title, description);
    const photos = Number(photoCount) || 0;
    const boxes = Number(boxCount) || 0;
    const identifiedCards = Number(uniqueHitCount) || 0;
    // Live identify `hits` is a top-k lookalike list, not cards in the photo.
    // Album views come from YOLO box count on a single photo. Front+back
    // gallery photos each have one box and must not sum to an album view.
    const albumView = boxes >= 2;

    if (albumView) {
        return {
            ...textClassification,
            kind: 'album',
            photoCount: photos,
            boxCount: boxes,
            uniqueHitCount: identifiedCards,
            view: 'album-view',
            reason: boxes >= 2 ? 'scan-multi-box' : 'scan-multi-card',
        };
    }
    if (textClassification.kind === 'album') {
        return {
            ...textClassification,
            photoCount: photos,
            boxCount: boxes,
            uniqueHitCount: identifiedCards,
            view: 'album-text',
        };
    }
    if (textClassification.kind === 'singles' || boxes === 1 || identifiedCards === 1) {
        return {
            ...textClassification,
            kind: 'singles',
            photoCount: photos,
            boxCount: boxes,
            uniqueHitCount: identifiedCards,
            view: 'single',
            reason: textClassification.kind === 'singles' ? textClassification.reason : 'scan-single-box',
        };
    }
    return {
        ...textClassification,
        photoCount: photos,
        boxCount: boxes,
        uniqueHitCount: identifiedCards,
        view: photos > 1 ? 'gallery' : 'unknown',
    };
}

function isUsableListingImageUrl(value = '') {
    const url = listingScanText(value);
    if (!/^https?:\/\//i.test(url)) {
        return false;
    }
    if (/^chrome-extension:/i.test(url) || /pokoin\.(?:com|svg)/i.test(url)) {
        return false;
    }
    return !/\.(?:svg)(?:[?#]|$)/i.test(url);
}

function vintedItemIdFromUrl(url = '') {
    const match = String(url || '').match(/\/items\/(\d+)/i);
    return match ? match[1] : '';
}

function vintedNodeItemId(node = null) {
    if (!node || typeof node !== 'object') {
        return '';
    }
    const raw = node.id ?? node.item_id ?? node.itemId;
    return /^\d+$/.test(String(raw || '')) ? String(raw) : '';
}

function vintedPhotoUrlFromValue(value) {
    if (typeof value === 'string') {
        return listingScanText(value);
    }
    if (!value || typeof value !== 'object') {
        return '';
    }
    return listingScanText(
        value.url
        || value.full_size_url
        || value.high_resolution?.url
        || value.image_url
        || value.src
        || ''
    );
}

function upgradeListingImageUrl(value = '') {
    let url = listingScanText(value);
    if (!url) {
        return '';
    }
    url = url.replace(/\/s-l(?:64|75|80|96|140|225|300|500)\./i, '/s-l1600.');
    url = url.replace(/\/(?:t|f)(?:52|72|75|150|200|300)\//i, '/f800/');
    return url;
}

function uniqueListingImageUrls(urls = [], { max } = {}) {
    const seen = new Set();
    const collected = (Array.isArray(urls) ? urls : [])
        .map((value) => upgradeListingImageUrl(value))
        .filter((url) => {
            if (!isUsableListingImageUrl(url) || seen.has(url)) {
                return false;
            }
            seen.add(url);
            return true;
        });
    const limit = Number(max);
    if (!Number.isFinite(limit) || limit <= 0) {
        return collected;
    }
    return collected.slice(0, Math.max(1, limit));
}

function listingImageSrcsetUrl(srcset = '') {
    const entries = String(srcset || '')
        .split(',')
        .map((part) => listingScanText(part))
        .filter(Boolean)
        .map((part) => {
            const [url, descriptor] = part.split(/\s+/);
            const size = Number(String(descriptor || '').replace(/[^0-9.]/g, ''));
            return {
                url: listingScanText(url),
                size: Number.isFinite(size) ? size : 0,
            };
        })
        .filter((entry) => entry.url);
    if (entries.length === 0) {
        return '';
    }
    entries.sort((left, right) => right.size - left.size);
    return entries[0].url;
}

function listingImageCandidateValues(node) {
    if (!node) {
        return [];
    }
    const srcset = node.getAttribute?.('srcset') || node.getAttribute?.('data-srcset') || node.srcset || '';
    return [
        node.getAttribute?.('content'),
        node.getAttribute?.('src'),
        node.getAttribute?.('data-src'),
        node.src,
        node.currentSrc,
        listingImageSrcsetUrl(srcset),
    ].map((value) => listingScanText(value)).filter(Boolean);
}

function collectVintedEmbeddedListingPhotoUrls(doc = null, { itemId = '', pageUrl = '' } = {}) {
    const urls = [];
    const wantedId = String(itemId || vintedItemIdFromUrl(pageUrl) || '').trim();
    const pushPhoto = (value) => {
        const url = vintedPhotoUrlFromValue(value);
        if (url) {
            urls.push(url);
        }
    };
    const walkPhotos = (photos) => {
        if (!Array.isArray(photos)) {
            return;
        }
        photos.forEach(pushPhoto);
    };
    const collectMatchingItemPhotos = (node, depth = 0) => {
        if (!node || typeof node !== 'object' || depth > 14) {
            return;
        }
        const nodeId = vintedNodeItemId(node);
        if (wantedId && nodeId === wantedId) {
            walkPhotos(node.photos);
            walkPhotos(node.item_photos);
        }
        if (Array.isArray(node)) {
            node.forEach((entry) => collectMatchingItemPhotos(entry, depth + 1));
            return;
        }
        Object.keys(node).forEach((key) => {
            if (key === 'photos' || key === 'item_photos') {
                return;
            }
            collectMatchingItemPhotos(node[key], depth + 1);
        });
    };
    try {
        const next = doc?.getElementById?.('__NEXT_DATA__');
        const raw = next?.textContent || next?.innerText || '';
        if (raw) {
            const data = JSON.parse(raw);
            const item = data?.props?.pageProps?.item
                || data?.props?.pageProps?.itemDto
                || data?.props?.pageProps?.itemData
                || {};
            const primaryId = vintedNodeItemId(item);
            if (!wantedId || !primaryId || primaryId === wantedId) {
                walkPhotos(item.photos);
                walkPhotos(item.item_photos);
            }
            if (wantedId) {
                collectMatchingItemPhotos(data);
            }
        }
    } catch (_) {
        // Listing JSON is optional; DOM gallery imgs still scan.
    }
    try {
        Array.from(doc?.querySelectorAll?.('script[type="application/ld+json"]') || []).forEach((node) => {
            const data = JSON.parse(node.textContent || node.innerText || '');
            const entries = Array.isArray(data) ? data : [data];
            entries.forEach((entry) => {
                const image = entry?.image;
                if (typeof image === 'string') {
                    pushPhoto(image);
                } else if (Array.isArray(image)) {
                    image.forEach(pushPhoto);
                }
            });
        });
    } catch (_) {
        // JSON-LD is optional.
    }
    return urls;
}

function extractListingImageUrlsFromDocument(doc = typeof document !== 'undefined' ? document : null, { source = '', pageUrl = '' } = {}) {
    if (!doc?.querySelectorAll) {
        return [];
    }
    const href = pageUrl
        || (typeof doc?.location?.href === 'string' ? doc.location.href : '')
        || (typeof location !== 'undefined' ? location.href : '');
    const selectors = source === 'ebay'
        ? [
            'meta[property="og:image"]',
            'img.ux-image-carousel-item',
            '#icImg',
            '.ux-image-grid img',
            'img[data-idx]',
        ]
        : source === 'cardmarket'
            ? [
                'meta[property="og:image"]',
                '#image img',
                '.card-image img',
                '.image img',
                'img.card-picture',
                '#mainContent img[src*="product"]',
                '#mainContent img[src*="cardmarket"]',
                'img[itemprop="image"]',
            ]
            : [
            '[data-testid^="item-photo-"][data-testid$="--img"]',
            '[data-testid^="item-photo-"] img',
            '[data-testid="item-photo"] img',
            '[data-testid="item-photo-container"] img',
            '.item-photos img',
            'img[itemprop="image"]',
            'meta[property="og:image"]',
        ];
    const collected = [];
    selectors.forEach((selector) => {
        const nodes = Array.from(doc.querySelectorAll(selector) || []);
        nodes.forEach((node) => {
            listingImageCandidateValues(node).forEach((value) => collected.push(value));
        });
    });
    if (source !== 'ebay' && source !== 'cardmarket') {
        collectVintedEmbeddedListingPhotoUrls(doc, { pageUrl: href }).forEach((url) => collected.push(url));
    }
    return uniqueListingImageUrls(collected);
}

function scanHitHasScore(hit = {}) {
    const raw = hit.score ?? hit.confidence ?? hit.similarity;
    return raw !== undefined && raw !== null && raw !== '';
}

function scanHitScore(hit = {}) {
    const score = Number(hit.score ?? hit.confidence ?? hit.similarity ?? 0);
    return Number.isFinite(score) ? score : 0;
}

function scanIdentityFromPayload(payload = {}) {
    const identity = listingScanText(payload.identity || '').toLowerCase();
    if (identity === 'public_id' || identity === 'tcgplayer') {
        return identity;
    }
    const catalog = listingScanText(payload.catalog || '').toLowerCase();
    if (catalog && catalog !== 'tcgplayer') {
        return 'public_id';
    }
    return 'tcgplayer';
}

function leftoverPublicId(value) {
    const leftover = listingScanText(value);
    if (!/^\d+$/.test(leftover)) {
        return '';
    }
    try {
        return String(BigInt(leftover) * 2n);
    } catch (_) {
        return '';
    }
}

function pokoinCardIdFromScanHit(hit = {}) {
    const publicId = listingScanText(hit.public_id || hit.publicId || '');
    if (/^\d+$/.test(publicId)) {
        return publicId;
    }
    const pokoinUrl = listingScanText(hit.pokoin_url || hit.canonical_url || '');
    const fromUrl = pokoinUrl.match(/pokoin\.com\/(?:marketplace\/[a-z0-9-]+\/cards\/)?(\d+)/i)
        || pokoinUrl.match(/pokoin\.com\/(\d+)(?:\/|$|\?)/i);
    if (fromUrl) {
        return fromUrl[1];
    }
    const identity = listingScanText(hit.identity || '').toLowerCase();
    const rawId = listingScanText(hit.id || hit.tcgplayer_id || hit.card_id || '');
    if (identity === 'public_id' && /^\d+$/.test(rawId)) {
        return rawId;
    }
    const fromLeftover = leftoverPublicId(hit.ct_id || hit.blueprint_id);
    if (fromLeftover) {
        return fromLeftover;
    }
    if (identity === 'tcgplayer') {
        return '';
    }
    if (/^\d+$/.test(rawId)) {
        return rawId;
    }
    return listingScanText(rawId);
}

function boxReadingKey(slot = {}) {
    const box = slot?.box?.xyxy || slot?.xyxy || [];
    return (Number(box[1]) || 0) * 10000 + (Number(box[0]) || 0);
}

function normalizeScanHit(hit = {}, options = {}) {
    if (!hit || typeof hit !== 'object') {
        return null;
    }
    const stamped = {
        ...hit,
        identity: listingScanText(hit.identity || options.identity || ''),
    };
    const name = listingScanText(stamped.name || stamped.card_name || stamped.cardName || '');
    const cardId = pokoinCardIdFromScanHit(stamped);
    const score = scanHitScore(stamped);
    if (!name && !cardId) {
        return null;
    }
    if (isIgnoredListingCard({ ...stamped, name })) {
        return null;
    }
    if (!options.allowLowScore && scanHitHasScore(stamped) && score <= CARDSCAN_IDENTIFY_MIN_SCORE) {
        return null;
    }
    return {
        id: cardId,
        name,
        collector_number: listingScanText(stamped.collector_number || stamped.card_number || stamped.printed_number || ''),
        set: listingScanText(stamped.set || stamped.set_name || stamped.expansion || ''),
        score,
        pokoin_url: listingScanText(stamped.pokoin_url || stamped.canonical_url || ''),
        image_url: listingScanText(stamped.image_url || stamped.imageUrl || stamped.preview_image_url || stamped.previewImageUrl || ''),
        blueprint_id: stamped.blueprint_id || '',
        ct_id: stamped.ct_id || '',
        public_id: cardId,
        identity: stamped.identity || '',
        raw: stamped,
    };
}

function topHitFromCardSlot(slot) {
    if (!slot || typeof slot !== 'object') {
        return null;
    }
    if (slot.box || Array.isArray(slot.hits) || slot.top1) {
        return slot.top1 || (Array.isArray(slot.hits) ? slot.hits[0] : null);
    }
    return slot;
}

function scanHitNameKey(hit = {}) {
    return listingScanCompact(hit.name || '');
}

function albumPayloadBoxCount(payload = {}) {
    return Number(payload.boxCount || payload.boxes?.length || 0);
}

/**
 * A dense binder page (6+ YOLO boxes on one photo) is the album view.
 * Extra-gallery photos may repeat those cards as EN/JP leftovers or inject
 * low-score lookalikes (Boxed Order 0.38 over Abra 0.88). Keep the first
 * binder-page hits even at 0.75. When the primary photo is dense, 1-box
 * extras still need >= 0.80; 2+ box extras and sparse lots keep 0.50.
 */
function keepDenseAlbumHits(hits = [], boxCount = 0) {
    const list = (Array.isArray(hits) ? hits : []).filter(Boolean);
    const denseCount = Number(boxCount) || 0;
    if (denseCount < CARDSCAN_ALBUM_DENSE_BOX_COUNT || list.length <= denseCount) {
        return list;
    }
    const primary = [];
    let extraStart = list.length;
    for (let index = 0; index < list.length; index += 1) {
        const hit = list[index];
        if (primary.length >= denseCount) {
            extraStart = index;
            break;
        }
        const score = scanHitScore(hit);
        if (primary.length >= CARDSCAN_ALBUM_DENSE_BOX_COUNT) {
            const primaryMin = Math.min(...primary.map((row) => scanHitScore(row)));
            if (score < 0.55 && primaryMin >= 0.70) {
                extraStart = index;
                break;
            }
        }
        primary.push(hit);
        extraStart = index + 1;
    }
    const seenNames = new Set(primary.map(scanHitNameKey).filter(Boolean));
    const extras = [];
    list.slice(extraStart).forEach((hit) => {
        const nameKey = scanHitNameKey(hit);
        if (nameKey && seenNames.has(nameKey)) {
            return;
        }
        if (scanHitScore(hit) < CARDSCAN_ALBUM_EXTRA_MIN_SCORE) {
            return;
        }
        if (nameKey) {
            seenNames.add(nameKey);
        }
        extras.push(hit);
    });
    return primary.concat(extras);
}

function uniqueScanHitsFromPayload(payload = {}, options = {}) {
    const collected = [];
    const seen = new Set();
    const identity = options.identity || scanIdentityFromPayload(payload);
    const photoCount = Number(payload.photoCount) || 0;
    const boxCount = albumPayloadBoxCount(payload);
    const keepPhotoOrder = photoCount > 1
        || payload.album === true
        || payload.albumMerged === true
        || boxCount >= 2;
    if (keepPhotoOrder && Array.isArray(payload.uniqueHits) && payload.uniqueHits.length && !options.fromCards) {
        payload.uniqueHits.forEach((hit) => {
            const normalized = normalizeScanHit(hit, { identity });
            if (!normalized) {
                return;
            }
            const key = scanHitIdentityKey(normalized);
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            collected.push(normalized);
        });
        if (payload.albumMerged) {
            return collected;
        }
        return keepDenseAlbumHits(collected, boxCount);
    }
    const rawSlots = Array.isArray(payload.cards) && payload.cards.length
        ? (keepPhotoOrder
            ? [...payload.cards]
            : [...payload.cards].sort((left, right) => boxReadingKey(left) - boxReadingKey(right)))
        : [payload.top1];
    rawSlots.forEach((slot) => {
        const normalized = normalizeScanHit(topHitFromCardSlot(slot) || slot, { identity });
        if (!normalized) {
            return;
        }
        const key = scanHitIdentityKey(normalized);
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        collected.push(normalized);
    });
    if (options.sortByScore !== false && rawSlots.length <= 1) {
        collected.sort((left, right) => right.score - left.score);
    }
    return keepPhotoOrder ? keepDenseAlbumHits(collected, boxCount) : collected;
}

function scanHitIdentityKey(hit = {}) {
    return [
        listingScanCompact(hit.id),
        listingScanCompact(hit.name),
        listingScanCompact(hit.collector_number),
    ].join('|');
}

function lookalikeScanHitsFromPayload(payload = {}) {
    const identity = scanIdentityFromPayload(payload);
    if (Array.isArray(payload.lookalikeHits) && payload.lookalikeHits.length) {
        const alreadyNormalized = payload.lookalikeHits.every((hit) => hit && hit.raw && (hit.id || hit.name));
        if (alreadyNormalized) {
            return [...payload.lookalikeHits].sort((left, right) => right.score - left.score);
        }
        return payload.lookalikeHits
            .map((hit) => normalizeScanHit(hit, { identity, allowLowScore: true }))
            .filter(Boolean)
            .sort((left, right) => right.score - left.score);
    }
    const collected = [];
    const seen = new Set();
    const raw = [];
    const add = (hit) => {
        if (hit) {
            raw.push(hit);
        }
    };
    add(payload.top1);
    const firstSlot = Array.isArray(payload.cards) ? payload.cards[0] : null;
    if (firstSlot && Array.isArray(firstSlot.hits) && firstSlot.hits.length) {
        firstSlot.hits.forEach(add);
    } else if (Array.isArray(payload.hits)) {
        payload.hits.forEach(add);
    }
    raw.forEach((hit) => {
        const normalized = normalizeScanHit(hit, { identity, allowLowScore: true });
        if (!normalized) {
            return;
        }
        const key = scanHitIdentityKey(normalized);
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        collected.push(normalized);
    });
    return collected.sort((left, right) => right.score - left.score);
}

function normalizeCardScanIdentifyPayload(json = {}) {
    const payload = json && typeof json === 'object' ? json : {};
    const boxes = Array.isArray(payload.boxes) ? payload.boxes : [];
    const identity = scanIdentityFromPayload(payload);
    const uniqueHits = uniqueScanHitsFromPayload(payload, { identity });
    const lookalikeHits = lookalikeScanHitsFromPayload(payload);
    const top1 = normalizeScanHit(payload.top1, { identity }) || uniqueHits[0] || null;
    return {
        ok: payload.ok !== false,
        identity,
        catalog: listingScanText(payload.catalog || ''),
        img_w: Number(payload.img_w) || 0,
        img_h: Number(payload.img_h) || 0,
        detect_ms: Number(payload.detect_ms) || 0,
        identify_ms: Number(payload.identify_ms) || 0,
        busy: Boolean(payload.busy),
        immediate: Boolean(payload.immediate),
        boxes,
        // Prefer server max-boxes-per-photo; concatenated album boxes must not
        // inflate a front+back gallery into an album view (D00000C).
        boxCount: Number(payload.boxCount) > 0 ? Number(payload.boxCount) : boxes.length,
        photoCount: Number(payload.photoCount) || 0,
        albumMerged: Boolean(payload.albumMerged),
        hits: uniqueHits,
        uniqueHits,
        uniqueHitCount: uniqueHits.length,
        lookalikeHits,
        top1,
        cards: Array.isArray(payload.cards) ? payload.cards : [],
        pokoin_url: listingScanText(payload.pokoin_url || ''),
        onDevice: Boolean(payload.onDevice),
        worker: listingScanText(payload.worker || ''),
        raw: payload,
    };
}

function mergeListingScanPayloads(payloads = [], options = {}) {
    const list = (Array.isArray(payloads) ? payloads : []).filter(Boolean);
    const listingKind = options.listingKind || '';
    const photoBoxCounts = list.map((payload) => Number(payload.boxCount || payload.boxes?.length || 0));
    const maxBoxes = photoBoxCounts.reduce((max, count) => Math.max(max, count), 0);
    const albumPayloads = options.ignoreBoxAlbum
        ? []
        : list.filter((payload) => Number(payload.boxCount || payload.boxes?.length || 0) >= 2);
    const mergeAlbumHits = listingKind === 'album' || albumPayloads.length > 0;
    if (mergeAlbumHits) {
        const sourcePayloads = listingKind === 'album' ? list : albumPayloads;
        const ranked = sourcePayloads.map((payload, index) => ({
            payload,
            index,
            boxes: albumPayloadBoxCount(payload),
        }));
        ranked.sort((left, right) => right.boxes - left.boxes || left.index - right.index);
        const primary = ranked[0];
        const dense = primary.boxes >= CARDSCAN_ALBUM_DENSE_BOX_COUNT;
        const hitsFromPhoto = (payload, allowLowScore) => {
            if (Array.isArray(payload.uniqueHits) && payload.uniqueHits.length) {
                return payload.uniqueHits;
            }
            return uniqueScanHitsFromPayload({
                ...payload,
                album: false,
                photoCount: 1,
            }, { sortByScore: false, allowLowScore, fromCards: true });
        };
        const primaryHits = hitsFromPhoto(primary.payload, true);
        const seenNames = new Set(primaryHits.map(scanHitNameKey).filter(Boolean));
        const seenKeys = new Set(primaryHits.map(scanHitIdentityKey));
        const extraHits = [];
        ranked.slice(1).forEach(({ payload, boxes }) => {
            const hits = hitsFromPhoto(payload, !dense);
            hits.forEach((hit) => {
                const key = scanHitIdentityKey(hit);
                const nameKey = scanHitNameKey(hit);
                if (seenKeys.has(key) || (nameKey && seenNames.has(nameKey))) {
                    return;
                }
                if (scanHitScore(hit) <= CARDSCAN_IDENTIFY_MIN_SCORE) {
                    return;
                }
                // Dense binder + 1-box extras are sparse closeups (Boxed Order).
                // Sparse lots still union 1-box photos at the 0.50 unique floor.
                // 2+ box extras are album views and keep that same floor.
                if (dense && boxes <= 1 && scanHitScore(hit) < CARDSCAN_ALBUM_EXTRA_MIN_SCORE) {
                    return;
                }
                seenKeys.add(key);
                if (nameKey) {
                    seenNames.add(nameKey);
                }
                extraHits.push(hit);
            });
        });
        const uniqueHits = primaryHits.concat(extraHits);
        const mergedBoxes = [];
        sourcePayloads.forEach((payload) => {
            mergedBoxes.push(...(payload.boxes || []));
        });
        return {
            ok: list.every((payload) => payload?.ok !== false),
            identity: sourcePayloads[0]?.identity || 'tcgplayer',
            boxes: mergedBoxes,
            boxCount: maxBoxes,
            hits: uniqueHits,
            uniqueHits,
            uniqueHitCount: uniqueHits.length,
            lookalikeHits: uniqueHits,
            top1: uniqueHits[0] || null,
            photoCount: list.length,
            albumMerged: true,
        };
    }
    const rankedPayloads = [...list]
        .filter((payload) => payload?.top1)
        .sort((left, right) => scanHitScore(right.top1) - scanHitScore(left.top1));
    const bestPayload = rankedPayloads[0] || null;
    const top1 = bestPayload?.top1 || null;
    const uniqueHits = top1 ? uniqueScanHitsFromPayload({ top1 }) : [];
    const lookalikeHits = bestPayload ? lookalikeScanHitsFromPayload(bestPayload) : [];
    return {
        ok: list.every((payload) => payload?.ok !== false),
        identity: list[0]?.identity || 'tcgplayer',
        boxes: list.flatMap((payload) => payload.boxes || []),
        boxCount: maxBoxes,
        hits: uniqueHits,
        uniqueHits,
        uniqueHitCount: uniqueHits.length,
        lookalikeHits,
        top1,
        photoCount: list.length,
    };
}

function shouldIdentifyListingPhotos(payload = null) {
    if (!payload?.enableListingScan) {
        return false;
    }
    if (payload.source === 'vinted' && !isVintedItemListingUrl(payload.listingKey || payload.url || '')) {
        return false;
    }
    if (payload.source === 'cardmarket' && !isCardmarketSinglesProductUrl(payload.listingKey || payload.url || '')) {
        return false;
    }
    return uniqueListingImageUrls(payload?.listingImageUrls || []).length > 0;
}

/**
 * Front+back singles galleries must keep the highest-score top1 (D00000C).
 * A listing misclassified as album from title text still collapses when every
 * photo is a 1-box closeup and the extra hit is below the 0.80 lot closeup floor.
 * Real binder pages (2+ YOLO boxes on one photo) keep every unique hit.
 */
function collapseFrontBackListingScan(scan = null, listingKind = '') {
    if (!scan) {
        return scan;
    }
    const hits = Array.isArray(scan.uniqueHits) ? scan.uniqueHits : [];
    if (hits.length <= 1) {
        return scan;
    }
    const boxCount = Number(scan.boxCount) || 0;
    if (boxCount >= 2) {
        return scan;
    }
    const photoCount = Number(scan.photoCount) || 0;
    if (listingKind === 'album' && photoCount > 2) {
        return scan;
    }
    const ranked = [...hits].sort((left, right) => scanHitScore(right) - scanHitScore(left));
    if (listingKind === 'album') {
        const extras = ranked.slice(1).filter((hit) => scanHitScore(hit) >= CARDSCAN_ALBUM_EXTRA_MIN_SCORE);
        if (extras.length) {
            return scan;
        }
    }
    const top1 = ranked[0];
    const lookalikeHits = Array.isArray(scan.lookalikeHits) && scan.lookalikeHits.length
        ? scan.lookalikeHits
        : ranked;
    return {
        ...scan,
        top1,
        hits: [top1],
        uniqueHits: [top1],
        uniqueHitCount: 1,
        lookalikeHits,
        albumMerged: false,
    };
}

function shouldSkipAlbumSpeciesCollapse(listingKind = '') {
    return listingKind === 'album';
}
