const PRINT_LANG_ORDER = ['eur', 'jp', 'cn'];
const PRINT_LANG_LABELS = {
    eur: 'EN',
    jp: 'JP',
    cn: 'CN',
};

function emptyPrintLangsIndex() {
    return { ids: {}, img: {} };
}

function leftoverSlug(name = '') {
    return String(name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function leftoverSlugFromUrl(url = '') {
    const match = String(url || '').match(/\/\d+_([^/?#]+)\.(?:jpe?g|png|webp)/i);
    return match ? match[1].replace(/_homepage$/i, '') : '';
}

function publicIdToCtId(cardId) {
    const id = String(cardId || '').trim();
    if (!/^\d+$/.test(id)) {
        return '';
    }
    try {
        const ctId = (BigInt(id) / 2n).toString();
        return ctId === '0' ? '' : ctId;
    } catch (_) {
        return '';
    }
}

function rewriteLeftoverImageUrl(url = '') {
    const text = String(url || '').trim();
    if (!text) {
        return '';
    }
    try {
        const parsed = new URL(text);
        if (/(^|\.)cdn\.pokoin\.com$/i.test(parsed.hostname)) {
            return `https://pokoin.com/card-images${parsed.pathname}${parsed.search}`;
        }
    } catch (_) {
        return text;
    }
    return text;
}

/** Same sibling as marketplace `homepageDerivativeUrl`: leftover JPEG stem + `_homepage.webp`. */
function homepageDerivativeUrl(value = '') {
    const leftover = rewriteLeftoverImageUrl(value);
    if (!leftover || /\/previews\//i.test(leftover) || /\/preview_/i.test(leftover)) {
        return '';
    }
    if (/_homepage\.webp(?:\?|$)/i.test(leftover)) {
        return leftover;
    }
    return leftover.replace(/\.(jpe?g|png|webp)(\?|$)/i, '_homepage.webp$2');
}

function rewriteImgMap(img = {}) {
    const next = {};
    Object.entries(img && typeof img === 'object' ? img : {}).forEach(([id, url]) => {
        const rewritten = rewriteLeftoverImageUrl(url);
        if (rewritten) {
            next[String(id)] = rewritten;
        }
    });
    return next;
}

function leftoverScanUrl(cardId, index = emptyPrintLangsIndex(), name = '', siblingIds = []) {
    const id = String(cardId || '').trim();
    if (!id) {
        return '';
    }
    const fromIndex = rewriteLeftoverImageUrl(index.img?.[id] || '');
    if (fromIndex) {
        return fromIndex;
    }
    const rec = index.ids?.[id];
    const siblings = siblingIds.length
        ? siblingIds
        : (Array.isArray(rec) ? rec.slice(0, 3) : []);
    for (const sibling of siblings) {
        const siblingId = String(sibling || '').trim();
        if (!siblingId || siblingId === id) {
            continue;
        }
        const url = rewriteLeftoverImageUrl(index.img?.[siblingId] || '');
        if (url) {
            return url;
        }
    }
    return '';
}

function printLangRec(rec = []) {
    return [
        String(rec[0] || '').trim(),
        String(rec[1] || '').trim(),
        String(rec[2] || '').trim(),
        Number(rec[3]) || 0,
        rec[4] || '',
    ];
}

const LEFTOVER_SET_SKIP = new Set([
    'rare', 'holo', 'secret', 'rainbow', 'ultra', 'promo', 'full',
    'illustration', 'special', 'art',
]);

/** Leftover stems use hyphens (`095-203-evolving-skies`), not slashes. */
function leftoverMetaFromUrl(url = '') {
    const slug = leftoverSlugFromUrl(url);
    if (!slug) {
        return { collector: '', expansion: '' };
    }
    const parts = slug.split('-').filter(Boolean);
    let collector = '';
    let setStart = -1;
    for (let i = 0; i < parts.length - 1; i += 1) {
        if (/^\d{1,4}[a-z]?$/i.test(parts[i]) && /^\d{1,4}[a-z]?$/i.test(parts[i + 1])) {
            collector = parts[i];
            setStart = i + 2;
            break;
        }
    }
    if (!collector) {
        for (let i = 0; i < parts.length; i += 1) {
            if (/^tg\d{1,3}$/i.test(parts[i])) {
                collector = parts[i].toUpperCase();
                setStart = i + 1;
                if (parts[i + 1] && /^tg\d{1,3}$/i.test(parts[i + 1])) {
                    setStart = i + 2;
                }
                break;
            }
        }
    }
    if (!collector) {
        const joined = parts.join(' ').toUpperCase();
        const slash = joined.match(/\b(?:[A-Z]{1,6}\s?)?\d{1,4}[A-Z]?\s*\/\s*\d{1,4}[A-Z]?\b/);
        if (slash) {
            collector = slash[0].replace(/\s+/g, '');
        }
    }
    if (!collector) {
        for (let i = 0; i < parts.length; i += 1) {
            if (/^[a-z]{1,6}\d{1,4}[a-z]?$/i.test(parts[i])) {
                collector = parts[i].toUpperCase();
                setStart = i + 1;
                break;
            }
        }
    }
    const setParts = [];
    if (setStart >= 0) {
        for (let i = setStart; i < parts.length; i += 1) {
            if (LEFTOVER_SET_SKIP.has(parts[i].toLowerCase())) {
                continue;
            }
            setParts.push(parts[i]);
        }
    }
    const setName = setParts.join(' ');
    const initials = setName
        .replace(/\b(?:and|of|the|a|an)\b/gi, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
    const expansion = initials.length >= 2 && initials.length <= 5
        ? initials
        : setName.split(/\s+/).filter(Boolean).map((part) => (
            part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        )).join(' ');
    return { collector, expansion };
}

function collectorLabelFromLeftoverUrl(url = '') {
    return leftoverMetaFromUrl(url).collector;
}

function expansionLabelFromLeftoverUrl(url = '') {
    return leftoverMetaFromUrl(url).expansion;
}

function printLangDeskUrl(cardId = '') {
    const id = String(cardId || '').trim();
    return id ? `https://pokoin.com/marketplace/en/cards/${encodeURIComponent(id)}` : '';
}

/** CLIP often splits a CN leftover (`thundurus-gx.jpg`) from its EN scan. Link them
 *  only when exactly one western leftover slug equals or continues that stem. */
function attachUniqueWesternSiblings(index = emptyPrintLangsIndex()) {
    const ids = index.ids || {};
    const img = index.img || {};
    const groups = new Map();
    Object.entries(ids).forEach(([pid, rec]) => {
        if (!Array.isArray(rec) || rec.length < 3) {
            return;
        }
        const next = printLangRec(rec);
        const key = `${next[0]}|${next[1]}|${next[2]}`;
        if (!groups.has(key)) {
            groups.set(key, { rec: next, keys: new Set() });
        }
        const group = groups.get(key);
        group.keys.add(String(pid));
        [next[0], next[1], next[2]].forEach((id) => {
            if (id) {
                group.keys.add(id);
            }
        });
    });

    const westernByPrefix = new Map();
    const rememberPrefix = (key, item) => {
        if (!key) {
            return;
        }
        const list = westernByPrefix.get(key);
        if (list) {
            list.push(item);
        } else {
            westernByPrefix.set(key, [item]);
        }
    };
    groups.forEach((group) => {
        const eur = group.rec[0];
        if (!eur) {
            return;
        }
        const slug = leftoverSlugFromUrl(img[eur] || '');
        if (!slug) {
            return;
        }
        const item = { eur, slug, group };
        rememberPrefix(slug, item);
        const parts = slug.split('-');
        let prefix = '';
        for (let i = 0; i < parts.length - 1; i += 1) {
            prefix = prefix ? `${prefix}-${parts[i]}` : parts[i];
            rememberPrefix(prefix, item);
        }
    });

    groups.forEach((group) => {
        const rec = group.rec;
        if (rec[0] || (!rec[1] && !rec[2])) {
            return;
        }
        const probe = rec[2] || rec[1];
        const slug = leftoverSlugFromUrl(img[probe] || '');
        if (!slug) {
            return;
        }
        const seen = new Set();
        const matches = [];
        (westernByPrefix.get(slug) || []).forEach((item) => {
            if (seen.has(item.eur)) {
                return;
            }
            seen.add(item.eur);
            matches.push(item);
        });
        if (matches.length !== 1) {
            return;
        }
        const westRec = matches[0].group.rec;
        if (westRec[1] && rec[1] && westRec[1] !== rec[1]) {
            return;
        }
        if (westRec[2] && rec[2] && westRec[2] !== rec[2]) {
            return;
        }
        const merged = [
            rec[0] || westRec[0],
            rec[1] || westRec[1],
            rec[2] || westRec[2],
            Math.max(Number(rec[3]) || 0, Number(westRec[3]) || 0),
            westRec[4] || rec[4],
        ];
        const keys = new Set([...group.keys, ...matches[0].group.keys, merged[0], merged[1], merged[2]]);
        keys.forEach((id) => {
            if (id) {
                ids[id] = merged;
            }
        });
    });
    return index;
}

function parsePrintLangsIndex(raw = {}) {
    if (!raw || typeof raw !== 'object') {
        return emptyPrintLangsIndex();
    }
    if (raw.ids && typeof raw.ids === 'object') {
        return attachUniqueWesternSiblings({
            ids: raw.ids,
            img: rewriteImgMap(raw.img),
        });
    }
    const ids = {};
    const img = {};
    Object.entries(raw).forEach(([cardId, entry]) => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        const eur = String(entry.eur || entry.western || '').trim();
        const jp = String(entry.jp || entry.japanese || '').trim();
        const cn = String(entry.cn || entry.chinese || '').trim();
        ids[String(cardId)] = [eur, jp, cn, Number(entry.v || entry.versions || 0) || 0, entry.art || entry.artwork_id || ''];
        ['eur', 'jp', 'cn', 'western', 'japanese', 'chinese'].forEach((key) => {
            const value = entry[key];
            if (value && typeof value === 'object' && value.id && value.image_url) {
                img[String(value.id)] = value.image_url;
            }
        });
        if (entry.img && typeof entry.img === 'object') {
            Object.assign(img, entry.img);
        }
    });
    return attachUniqueWesternSiblings({ ids, img: rewriteImgMap(img) });
}

function printLangPack(cardId, index = emptyPrintLangsIndex(), name = '', siblingIds = []) {
    const id = String(cardId || '').trim();
    if (!id) {
        return null;
    }
    return { id, image_url: leftoverScanUrl(id, index, name, siblingIds) };
}

function printLangsForCardId(cardId, index = emptyPrintLangsIndex(), name = '') {
    const id = String(cardId || '').trim();
    if (!id || !index?.ids) {
        return null;
    }
    const record = index.ids[id];
    if (!Array.isArray(record) || record.length < 3) {
        return null;
    }
    const [eurId, jpId, cnId, versions, artworkId] = record;
    const siblingIds = [eurId, jpId, cnId];
    return {
        eur: eurId ? printLangPack(eurId, index, name, siblingIds) : null,
        jp: jpId ? printLangPack(jpId, index, name, siblingIds) : null,
        cn: cnId ? printLangPack(cnId, index, name, siblingIds) : null,
        // Name-wide COUNT(*) by English gameplay name — not CardTrader lineage.
        // Leftover tiles must not paint this (desk "View all N versions" is the source).
        versions: Number(versions) || 0,
        artwork_id: artworkId || '',
    };
}

function chinesePrintBlob(row = {}) {
    return [
        row.set_name,
        row.set,
        row.expansion_name,
        row.expansionName,
        row.expansion_code,
        row.expansionCode,
        row.set_code,
        row.setCode,
        row.card_number,
        row.collector_number,
        row.nationality,
        row.print_language,
        row.language,
    ].map((value) => String(value || '')).join(' ');
}

function isChinesePrinting(row = {}) {
    const nationality = String(row.nationality || row.print_language || row.language || '').toLowerCase();
    if (nationality === 'chinese' || nationality === 'cn' || nationality === 'zh') {
        return true;
    }
    return /\b(?:CS\d+[a-z]?|CSMPi\w*|CSH\w*)\b/i.test(chinesePrintBlob(row));
}

function leftoverLooksJapanese(value = '') {
    const text = String(value || '');
    if (!text) {
        return false;
    }
    const slug = leftoverSlugFromUrl(text) || leftoverSlug(text) || text;
    return /(?:^|[-_/.])jp(?:[-_.]|$)|rocket-gang|gym-booster|pcg-p|dpbp[-_]/i.test(slug);
}

function isJapanesePrinting(row = {}) {
    const nationality = String(row.nationality || row.print_language || row.language || '').toLowerCase();
    if (nationality === 'japanese' || nationality === 'jp' || nationality === 'ja') {
        return true;
    }
    const blob = [
        chinesePrintBlob(row),
        row.name,
        row.name_en,
        row.image_url,
        row.imageUrl,
        row.preview_image_url,
        row.previewImageUrl,
        row.cdn_image_url,
        row.cdnImageUrl,
        row.print_langs?.eur?.image_url,
        row.print_langs?.jp?.image_url,
    ].map((value) => String(value || '')).join(' ');
    if (leftoverLooksJapanese(blob)) {
        return true;
    }
    return /\brocket gang\b/i.test(blob);
}

function stuffedEurIsOwnMatch(langs, id) {
    return Boolean(id && langs?.eur?.id === id);
}

/** Chinese leftovers sometimes land in the eur slot (CS4a, CSMPi). JP Rocket Gang
 *  leftovers do the same. Keep EUR only when that pack is a different western public_id. */
function normalizePrintLangs(row = {}, langs = null) {
    if (!langs) {
        return langs;
    }
    const id = String(row.card_id || row.cardId || '').trim();
    if (
        stuffedEurIsOwnMatch(langs, id)
        && isChinesePrinting(row)
        && !langs.cn
    ) {
        return { ...langs, eur: null, cn: langs.eur };
    }
    if (
        stuffedEurIsOwnMatch(langs, id)
        && !langs.jp
        && (isJapanesePrinting(row) || leftoverLooksJapanese(langs.eur?.image_url))
    ) {
        return { ...langs, eur: null, jp: langs.eur };
    }
    return langs;
}

function inferredPrintLangKey(row = {}) {
    if (isChinesePrinting(row)) {
        return 'cn';
    }
    if (isJapanesePrinting(row)) {
        return 'jp';
    }
    return 'eur';
}

function ownLeftoverPack(row = {}, index = emptyPrintLangsIndex()) {
    const id = String(row.card_id || row.cardId || '').trim();
    if (!id) {
        return null;
    }
    const fromIndex = leftoverScanUrl(id, index, row.name || row.name_en || '');
    const fromRow = rewriteLeftoverImageUrl(
        row.preview_image_url || row.previewImageUrl || row.image_url || row.imageUrl || '',
    );
    return { id, image_url: fromIndex || fromRow };
}

/** Album/leftover tiles always have EN/JP/CN. Missing index packs stay empty;
 *  the matched leftover still fills the inferred language so one button works. */
function tilePrintLangs(row = {}, langs = null, index = emptyPrintLangsIndex()) {
    const normalized = normalizePrintLangs(row, langs) || {};
    const next = {
        eur: normalized.eur || null,
        jp: normalized.jp || null,
        cn: normalized.cn || null,
        versions: Number(normalized.versions) || 0,
        artwork_id: normalized.artwork_id || '',
    };
    if (next.eur || next.jp || next.cn) {
        return next;
    }
    const own = ownLeftoverPack(row, index);
    if (own) {
        next[inferredPrintLangKey(row)] = own;
    }
    return next;
}

function mergePrintLangPack(preferred = null, fallback = null) {
    if (!preferred && !fallback) {
        return null;
    }
    if (!preferred) {
        return fallback;
    }
    if (!fallback) {
        return preferred;
    }
    return {
        id: preferred.id || fallback.id,
        image_url: preferred.image_url || fallback.image_url || '',
        canonical_path: preferred.canonical_path || fallback.canonical_path || '',
    };
}

function mergePrintLangs(live = null, bundled = null) {
    const hasLive = Boolean(live && (live.eur || live.jp || live.cn));
    const hasBundled = Boolean(bundled && (bundled.eur || bundled.jp || bundled.cn));
    if (!hasLive && !hasBundled) {
        return live || bundled || null;
    }
    const left = live || {};
    const right = bundled || {};
    return {
        eur: mergePrintLangPack(left.eur, right.eur),
        jp: mergePrintLangPack(left.jp, right.jp),
        cn: mergePrintLangPack(left.cn, right.cn),
        versions: Number(left.versions) || Number(right.versions) || 0,
        artwork_id: left.artwork_id || right.artwork_id || '',
    };
}

function applyWesternEmbed(row = {}, index = emptyPrintLangsIndex()) {
    row = row && typeof row === 'object' ? row : {};
    const bundled = printLangsForCardId(row.card_id || row.cardId, index, row.name || row.name_en || '');
    const langs = normalizePrintLangs(
        row,
        mergePrintLangs(row.print_langs, bundled),
    );
    if (!langs || !(langs.eur || langs.jp || langs.cn)) {
        return row;
    }
    row.print_langs = langs;
    // card_id stays the identify match. Leftover tiles default to the western
    // scan when a western sibling exists; Chinese-only leftovers stay CN;
    // Japanese-only leftovers (Rocket Gang) stay JP.
    const westernUrl = langs.eur?.image_url || '';
    if (westernUrl) {
        row.image_url = westernUrl;
        row.preview_image_url = westernUrl;
        row.imageUrl = westernUrl;
        row.previewImageUrl = westernUrl;
    }
    return row;
}

function hasLeftoverEmbed(row = {}, index = emptyPrintLangsIndex()) {
    row = row && typeof row === 'object' ? row : {};
    const langs = typeof tilePrintLangs === 'function'
        ? tilePrintLangs(row, row.print_langs, index)
        : row.print_langs;
    return Boolean(langs && (langs.eur?.image_url || langs.jp?.image_url || langs.cn?.image_url));
}

function leftoverTileKeys(row = {}, index = emptyPrintLangsIndex()) {
    const keys = [];
    const langs = typeof tilePrintLangs === 'function'
        ? tilePrintLangs(row, row.print_langs, index)
        : row.print_langs;
    const packs = [langs?.eur, langs?.jp, langs?.cn];
    packs.forEach((pack) => {
        const id = String(pack?.id || '').trim();
        if (id) {
            keys.push(`id:${id}`);
        }
        const slug = leftoverSlugFromUrl(pack?.image_url || '');
        if (slug) {
            keys.push(`slug:${slug.replace(/_homepage$/i, '')}`);
        }
    });
    const displayUrl = langs?.eur?.image_url
        || langs?.jp?.image_url
        || langs?.cn?.image_url
        || rewriteLeftoverImageUrl(row.preview_image_url || row.image_url || '');
    const meta = leftoverMetaFromUrl(displayUrl);
    const name = leftoverSlug(row.name || row.name_en || '');
    const collector = String(meta.collector || '').toLowerCase();
    const expansion = leftoverSlug(meta.expansion || '');
    if (name && collector) {
        keys.push(`label:${name}|${collector}|${expansion}`);
    }
    return keys;
}

function pickLeftoverTileRow(members = []) {
    const keep = members[0] && typeof members[0] === 'object' ? { ...members[0] } : members[0];
    if (!keep) {
        return keep;
    }
    const withSet = members.find((row) => row?.set_name || row?.expansion_name || row?.expansion_symbol_url);
    if (withSet) {
        keep.set_name = keep.set_name || withSet.set_name || withSet.expansion_name || '';
        keep.expansion_name = keep.expansion_name || withSet.expansion_name || keep.set_name;
        keep.expansion_symbol_url = keep.expansion_symbol_url
            || withSet.expansion_symbol_url
            || withSet.expansionSymbolUrl
            || '';
    }
    const withPrice = members.find((row) => row?.pokoin_price || row?.pokoinPrice || row?.print_lang_prices);
    if (withPrice) {
        keep.pokoin_price = keep.pokoin_price || withPrice.pokoin_price || withPrice.pokoinPrice || '';
        keep.pokoinPrice = keep.pokoinPrice || keep.pokoin_price;
        keep.print_lang_prices = keep.print_lang_prices || withPrice.print_lang_prices;
        keep.print_lang_price_pkn = keep.print_lang_price_pkn || withPrice.print_lang_price_pkn;
    }
    keep.leftoverCopies = members.length;
    return keep;
}

/** Overlay duplicate leftover printings onto one tile before the album grid. */
function uniqueRowsByLeftoverTile(rows = [], index = emptyPrintLangsIndex()) {
    const list = (Array.isArray(rows) ? rows : []).filter((row) => row && (row.card_id || row.cardId));
    if (list.length < 2) {
        return list.map((row) => ({ ...row, leftoverCopies: Number(row.leftoverCopies) || 1 }));
    }
    const parent = list.map((_, offset) => offset);
    const find = (offset) => {
        while (parent[offset] !== offset) {
            parent[offset] = parent[parent[offset]];
            offset = parent[offset];
        }
        return offset;
    };
    const unite = (left, right) => {
        const rootLeft = find(left);
        const rootRight = find(right);
        if (rootLeft !== rootRight) {
            parent[rootRight] = rootLeft;
        }
    };
    const keyIndex = new Map();
    list.forEach((row, offset) => {
        leftoverTileKeys(row, index).forEach((key) => {
            if (keyIndex.has(key)) {
                unite(offset, keyIndex.get(key));
            } else {
                keyIndex.set(key, offset);
            }
        });
    });
    const seen = new Set();
    const next = [];
    list.forEach((row, offset) => {
        const root = find(offset);
        if (seen.has(root)) {
            return;
        }
        seen.add(root);
        const members = list.filter((_, other) => find(other) === root);
        next.push(pickLeftoverTileRow(members));
    });
    return next;
}
