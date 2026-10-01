#!/usr/bin/env node
/**
 * Hop-by-hop replica of the Chrome extension Cardvault + cardscan path.
 * Same hosts, same multipart field, same JSON bodies the service worker sends.
 *
 *   node scripts/pipeline-bench.mjs
 *   VINTED_ITEM_URL=https://www.vinted.it/items/... node scripts/pipeline-bench.mjs
 *
 * Writes JSON to scripts/out/pipeline-bench-latest.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpuUsage, hrtime, memoryUsage } from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'scripts', 'out');
const CARDSCAN_IDENTIFY_URL = 'https://cardscan.pokoin.com/identify';
const CARDVAULT_API_BASE_URL = (process.env.CARDVAULT_API_BASE_URL || 'https://pokoin.com').replace(/\/$/, '');
const VINTED_ITEM_URL = process.env.VINTED_ITEM_URL
    || 'https://www.vinted.it/items/9601989251-pokemon-machamp-lv59';
const FALLBACK_PHOTOS = [
    'https://images1.vinted.net/t/02_02128_978Th5LpKnqbeq1AZeGLrCu4/f800/1786129845.webp?s=4c66bde8bb6b3b9ad653d9d795b7710e4952178f',
    'https://images1.vinted.net/t/02_01a2d_RdHX4YJ77EMTGaQ3i6nKU2rF/f800/1786129845.webp?s=ac9cb9a17ec7dcd2c1fb246f0e26c2cecf0d3df7',
];

function summarizeHits(payload) {
    const hits = Array.isArray(payload?.hits) ? payload.hits : [];
    const top1 = payload?.top1 || hits[0] || null;
    return {
        ok: payload?.ok,
        identity: payload?.identity,
        boxCount: Array.isArray(payload?.boxes) ? payload.boxes.length : 0,
        hitCount: hits.length,
        top1: top1 && {
            name: top1.name || top1.card_name || '',
            set: top1.set || top1.set_name || '',
            collector_number: top1.collector_number || top1.card_number || '',
            score: top1.score,
            id: top1.id || top1.blueprint_id || top1.ct_id || '',
        },
        hits: hits.slice(0, 8).map((hit) => ({
            name: hit.name || hit.card_name || '',
            set: hit.set || hit.set_name || '',
            collector_number: hit.collector_number || hit.card_number || '',
            score: hit.score,
            id: hit.id || hit.blueprint_id || hit.ct_id || '',
        })),
    };
}

async function timed(label, fn) {
    const cpuBefore = cpuUsage();
    const memBefore = memoryUsage.rss;
    const t0 = performance.now();
    const ns0 = hrtime.bigint();
    let error = null;
    let value = null;
    try {
        value = await fn();
    } catch (caught) {
        error = caught;
    }
    const ms = Number(hrtime.bigint() - ns0) / 1e6;
    const cpu = cpuUsage(cpuBefore);
    return {
        label,
        ok: !error,
        ms: Math.round(ms * 10) / 10,
        wallMs: Math.round((performance.now() - t0) * 10) / 10,
        cpuUserMs: Math.round(cpu.user / 100) / 10,
        cpuSystemMs: Math.round(cpu.system / 100) / 10,
        rssDeltaBytes: memoryUsage.rss - memBefore,
        error: error ? (error.message || String(error)) : '',
        value,
    };
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = { parseError: true, text: text.slice(0, 400) };
    }
    return { status: response.status, ok: response.ok, json, bytes: text.length };
}

async function identifyPhoto(url, topK = 5) {
    const download = await timed(`download ${url.slice(0, 72)}`, async () => {
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) {
            throw new Error(`image HTTP ${response.status}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        return { bytes: buffer.length, type: response.headers.get('content-type') || '', buffer };
    });
    if (!download.ok) {
        return { download, identify: null };
    }
    const identify = await timed('cardscan identify POST', async () => {
        const body = new FormData();
        body.append('file', new Blob([download.value.buffer], { type: download.value.type || 'image/webp' }), 'listing.jpg');
        return fetchJson(`${CARDSCAN_IDENTIFY_URL}?live=1&top_k=${topK}`, { method: 'POST', body });
    });
    return { download, identify };
}

async function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    const startedAt = new Date().toISOString();
    const photoUrls = FALLBACK_PHOTOS;

    const listing = await timed('vinted listing GET', () => fetch(VINTED_ITEM_URL).then(async (response) => ({
        status: response.status,
        bytes: Number(response.headers.get('content-length') || 0),
        ok: response.ok,
    })));

    const photos = [];
    for (const url of photoUrls) {
        photos.push({ url, ...(await identifyPhoto(url, 5)) });
    }
    const parallelIdentify = await timed('parallel identify both photos', async () => {
        const results = await Promise.all(photoUrls.map((url) => identifyPhoto(url, 5)));
        return results.map((result) => ({
            downloadMs: result.download?.ms,
            identifyMs: result.identify?.ms,
            identifyStatus: result.identify?.value?.status,
            top1: summarizeHits(result.identify?.value?.json).top1,
        }));
    });

    const searchBodies = [
        {
            name: 'compact name+level (current 400-fix payload)',
            payload: { name: 'Machamp', levelNumber: '59', language: 'en', limit: 8 },
        },
        {
            name: 'wrong collector 59 as LV digits',
            payload: { name: 'Machamp', collectorNumber: '59', numericCollectorNumber: '59', levelNumber: '59', language: 'en', limit: 8 },
        },
        {
            name: 'illustration rarity selected',
            payload: {
                name: 'Machamp',
                levelNumber: '59',
                rarity: 'Illustration Rare',
                rarityAliases: ['Illustration Rare', 'Special Illustration Rare', 'full art', 'illustration'],
                language: 'en',
                limit: 8,
            },
        },
        {
            name: 'Diamond & Pearl + level, no collector',
            payload: { name: 'Machamp', expansion: 'Diamond & Pearl', levelNumber: '59', language: 'en', limit: 8 },
        },
        {
            name: 'Diamond & Pearl 31/130 (printed collector)',
            payload: { name: 'Machamp', expansion: 'Diamond & Pearl', collectorNumber: '31/130', numericCollectorNumber: '31', language: 'en', limit: 8 },
        },
        {
            name: 'Italian expansion string as sent if chip selected',
            payload: { name: 'Machamp', expansion: 'Diamante Perla', levelNumber: '59', language: 'en', limit: 8 },
        },
    ];

    const extensionSearches = [];
    for (const entry of searchBodies) {
        const hop = await timed(`extension-card-search ${entry.name}`, () =>
            fetchJson(`${CARDVAULT_API_BASE_URL}/api/extension-card-search`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(entry.payload),
            }));
        const matches = hop.value?.json?.matches || hop.value?.json?.rows || [];
        extensionSearches.push({
            ...hop,
            value: {
                status: hop.value?.status,
                ok: hop.value?.ok,
                cfBlocked: hop.value?.status === 403,
                matchCount: Array.isArray(matches) ? matches.length : 0,
                top: (Array.isArray(matches) ? matches : []).slice(0, 5).map((match) => ({
                    name: match.name || match.name_en,
                    set: match.expansionName || match.set_name,
                    number: match.collectorNumber || match.card_number,
                    id: match.cardId || match.card_id,
                    score: match.score,
                })),
            },
        });
    }

    const autocompleteQueries = [
        'Machamp Lv. 59',
        'Machamp 59',
        'Machamp Diamond & Pearl',
        'Machamp Diamond & Pearl 31',
        'Machamp Diamante Perla',
        'Machamp',
    ];
    const autocompletes = [];
    for (const search_term of autocompleteQueries) {
        const hop = await timed(`autocomplete ${search_term}`, () =>
            fetchJson(`${CARDVAULT_API_BASE_URL}/api/marketplace-autocomplete`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    search_term,
                    result_limit: 8,
                    pool_limit: 50,
                    search_language: 'en',
                }),
            }));
        const rows = hop.value?.json?.rows || hop.value?.json || [];
        autocompletes.push({
            ...hop,
            value: {
                status: hop.value?.status,
                ok: hop.value?.ok,
                cfBlocked: hop.value?.status === 403,
                rowCount: Array.isArray(rows) ? rows.length : 0,
                top: (Array.isArray(rows) ? rows : []).slice(0, 5).map((row) => ({
                    name: row.name,
                    set: row.set_name,
                    number: row.card_number,
                    id: row.card_id,
                })),
            },
        });
    }

    const report = {
        startedAt,
        host: {
            platform: process.platform,
            node: process.version,
            listing: VINTED_ITEM_URL,
            cardscan: CARDSCAN_IDENTIFY_URL,
            cardvault: CARDVAULT_API_BASE_URL,
        },
        listing,
        sequentialPhotos: photos.map((photo) => ({
            url: photo.url,
            download: { ok: photo.download.ok, ms: photo.download.ms, bytes: photo.download.value?.bytes, error: photo.download.error },
            identify: photo.identify && {
                ok: photo.identify.ok,
                ms: photo.identify.ms,
                cpuUserMs: photo.identify.cpuUserMs,
                status: photo.identify.value?.status,
                summary: summarizeHits(photo.identify.value?.json),
                error: photo.identify.error,
            },
        })),
        parallelIdentify: {
            ms: parallelIdentify.ms,
            cpuUserMs: parallelIdentify.cpuUserMs,
            cpuSystemMs: parallelIdentify.cpuSystemMs,
            photos: parallelIdentify.value,
            error: parallelIdentify.error,
        },
        extensionSearches,
        autocompletes,
        notes: [
            'Identify hops in the extension abort after LISTING_IDENTIFY_TIMEOUT_MS (20s), including album /identify-album.',
            'Chip-search POSTs to pokoin.com; nezopt may see Cloudflare 403 while Chrome on the Mac still reaches Cardvault.',
            'LV.59 is a printed level, not collector 31/130. Name-only Machamp fills 8 unrelated sets.',
        ],
    };

    const outPath = join(OUT_DIR, 'pipeline-bench-latest.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    writeFileSync(join(OUT_DIR, `pipeline-bench-${startedAt.replace(/[:.]/g, '-')}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        outPath,
        listingMs: listing.ms,
        parallelIdentifyMs: parallelIdentify.ms,
        photos: report.sequentialPhotos.map((photo) => ({
            downloadMs: photo.download.ms,
            identifyMs: photo.identify?.ms,
            identifyStatus: photo.identify?.status,
            top1: photo.identify?.summary?.top1,
        })),
        searchStatuses: extensionSearches.map((entry) => ({ label: entry.label, status: entry.value.status, ms: entry.ms, top: entry.value.top?.[0] })),
        autocompleteStatuses: autocompletes.map((entry) => ({ label: entry.label, status: entry.value.status, ms: entry.ms, top: entry.value.top?.[0] })),
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
