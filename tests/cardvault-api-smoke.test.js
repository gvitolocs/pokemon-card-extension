const assert = require('node:assert/strict');
const test = require('node:test');

const API_BASE_URL = (process.env.CARDVAULT_API_BASE_URL || 'https://pokoin.com').replace(/\/$/, '');
const SEARCH_LANGUAGE = process.env.CARDVAULT_SEARCH_LANGUAGE || 'en';
const REQUEST_TIMEOUT_MS = Number(process.env.CARDVAULT_TEST_TIMEOUT_MS || 15000);

const autocompleteCache = new Map();

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function autocomplete(searchTerm, options = {}) {
    const cacheKey = JSON.stringify({ searchTerm, options });
    if (autocompleteCache.has(cacheKey)) {
        return autocompleteCache.get(cacheKey);
    }

    const response = await fetchWithTimeout(`${API_BASE_URL}/api/marketplace-autocomplete`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            search_term: searchTerm,
            result_limit: options.resultLimit || 5,
            pool_limit: options.poolLimit || 50,
            search_language: SEARCH_LANGUAGE,
        }),
    });

    assert.equal(response.status, 200, `${searchTerm} should return HTTP 200`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload.rows;
    assert.ok(Array.isArray(rows), `${searchTerm} should return an array`);
    autocompleteCache.set(cacheKey, rows);
    return rows;
}

function topRow(rows, label) {
    assert.ok(rows.length > 0, `${label} should return at least one candidate`);
    return rows[0];
}

test('1. exact numeric query finds Mew ex 232/091', async () => {
    const row = topRow(await autocomplete('mew 232'), 'mew 232');

    assert.equal(String(row.card_id), '274416');
    assert.match(row.name, /^Mew ex$/i);
    assert.match(row.set_name, /Paldean Fates/i);
    assert.match(row.card_number, /232\/091/);
});

test('2. typo numeric query still finds Mew ex 232/091', async () => {
    const row = topRow(await autocomplete('mee 232'), 'mee 232');

    assert.equal(String(row.card_id), '274416');
    assert.match(row.name, /^Mew ex$/i);
    assert.match(row.card_number, /232\/091/);
});

test('3. set-aware query includes Pikachu from Unified Minds', async () => {
    const rows = await autocomplete('pikachu unified', { resultLimit: 20, poolLimit: 100 });
    const match = rows.find((row) =>
        /pikachu/i.test(row.name || '') &&
        /Unified Minds/i.test(row.set_name || '')
    );

    assert.ok(match, 'pikachu unified should include Pikachu from Unified Minds');
});

test('4. broad card-name query returns Porygon candidates', async () => {
    const rows = await autocomplete('porygon');

    assert.ok(rows.some((row) => /porygon/i.test(row.name || '')));
});

test('5. structured variation query ranks Charizard ex', async () => {
    const row = topRow(await autocomplete('char ex'), 'char ex');

    assert.match(row.name, /Charizard ex/i);
});

test('6. standalone V variation returns real V cards', async () => {
    const row = topRow(await autocomplete('v'), 'v');

    assert.match(row.name, /\bV\b/i);
});

test('7. name plus V variation ranks Darkrai V', async () => {
    const row = topRow(await autocomplete('darkrai v'), 'darkrai v');

    assert.match(row.name, /^Darkrai V$/i);
});

test('8. typo LV.X query ranks Azelf LV.X', async () => {
    const row = topRow(await autocomplete('azief lv x'), 'azief lv x');

    assert.match(row.name, /Azelf LV\.X/i);
});

test('9. name plus EX variation ranks Flareon ex', async () => {
    const row = topRow(await autocomplete('flareon ex'), 'flareon ex');

    assert.match(row.name, /^Flareon ex$/i);
});

test('10. name plus EX variation ranks Manaphy ex', async () => {
    const row = topRow(await autocomplete('manaphy ex'), 'manaphy ex');

    assert.match(row.name, /^Manaphy ex$/i);
});

test('11. Italian trainer alias query finds Cynthia card', async () => {
    const row = topRow(await autocomplete('garchomp di camilla'), 'garchomp di camilla');

    assert.match(row.name, /Cynthia.*Garchomp/i);
});

test('12. CardTrader redirect uses canonical Cardvault redirect endpoint', async () => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/cardtrader-redirect?id=274416`, {
        redirect: 'manual',
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), 'https://www.cardtrader.com/en/cards/274416');
});

test('13. Cardvault name table validates Pecharunt from noisy Vinted title token', async () => {
    const rows = await autocomplete('Pecharunt', { resultLimit: 3, poolLimit: 30 });
    const exactName = rows.find((row) =>
        String(row.canonical_name || row.name || '').toLowerCase() === 'pecharunt'
    );

    assert.ok(exactName, 'Pecharunt should resolve through Cardvault card names');
});

test('14. cleaned Nidoran Base Set alias avoids generic Pokemon token matches', async () => {
    const rows = await autocomplete('Nidoran Base Set', { resultLimit: 5, poolLimit: 50 });

    assert.ok(rows.length > 0, 'Nidoran should return candidates');
    assert.match(rows[0].name || '', /Nidoran/i);
    assert.match(rows[0].set_name || '', /Base Set/i);
});

test('15. Nidoran Base Set candidates include both genders', async () => {
    const rows = await autocomplete('Nidoran Base Set', { resultLimit: 8, poolLimit: 80 });
    const names = rows.map((row) => row.name || '').join(' | ');

    assert.match(names, /Nidoran ♀/);
    assert.match(names, /Nidoran ♂/);
});

test('16. explicit Base Set clue maps Gastly toward Base Set', async () => {
    const rows = await autocomplete('Gastly Base Set', { resultLimit: 5, poolLimit: 50 });

    assert.ok(rows.length > 0, 'Gastly Base Set should return candidates');
    assert.match(rows[0].name || '', /^Gastly$/i);
    assert.match(rows[0].set_name || '', /^Base Set$/i);
});

test('17. Gastly Base Set family has three vintage candidates before Expedition', async () => {
    const rows = await autocomplete('Gastly Base Set', { resultLimit: 8, poolLimit: 80 });
    const baseFamily = rows.filter((row) =>
        /^Base Set(?: 2| Shadowless)?$/i.test(row.set_name || '')
    );

    assert.ok(baseFamily.length >= 3, 'Gastly should include Base Set, Base Set 2, and Shadowless candidates');
    assert.deepEqual(
        baseFamily.slice(0, 3).map((row) => row.set_name),
        ['Base Set', 'Base Set 2', 'Base Set Shadowless']
    );
});

test('18. padded Dragon Selection query ranks Latias DRS 009', async () => {
    const row = topRow(await autocomplete('Latias DRS 009'), 'Latias DRS 009');

    assert.equal(String(row.card_id), '314714');
    assert.match(row.name || '', /^Latias$/i);
    assert.match(row.set_name || '', /^Dragon Selection$/i);
    assert.match(row.card_number || '', /009\/020/);
});

test('19. live cardscan identify accepts multipart file and returns the verified empty-image shape', async () => {
    const jpeg = Uint8Array.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
        0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C,
        0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
        0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32,
        0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
        0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08,
        0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0xFF, 0xD9,
    ]);
    const body = new FormData();
    body.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'tiny.jpg');
    const response = await fetchWithTimeout('https://cardscan.pokoin.com/identify?live=1&top_k=5', {
        method: 'POST',
        body,
    });
    assert.equal(response.status, 200, 'cardscan identify should return HTTP 200');
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.identity, 'tcgplayer');
    assert.ok(Array.isArray(payload.boxes));
    assert.ok(Array.isArray(payload.hits));
    assert.equal(payload.top1, null);
    assert.deepEqual(payload.boxes, []);
    assert.deepEqual(payload.hits, []);
});

test('20. live leftover-JPEG identify and album routes are public_id', async () => {
    const jpeg = Uint8Array.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
        0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C,
        0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
        0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32,
        0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
        0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08,
        0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0x7F, 0xFF, 0xD9,
    ]);
    const body = new FormData();
    body.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'tiny.jpg');
    const singles = await fetchWithTimeout('https://cardscan.pokoin.com/identify?live=1&catalog=pokemon_generic&top_k=8', {
        method: 'POST',
        body,
    });
    assert.equal(singles.status, 200);
    const singlesPayload = await singles.json();
    assert.equal(singlesPayload.ok, true);
    assert.equal(singlesPayload.identity, 'public_id');
    assert.equal(singlesPayload.catalog, 'pokemon_generic');

    const albumMissing = await fetchWithTimeout('https://cardscan.pokoin.com/identify-album?live=1&top_k=1', {
        method: 'POST',
    });
    assert.equal(albumMissing.status, 422);

    const albumBody = new FormData();
    albumBody.append('file', new Blob([jpeg], { type: 'image/jpeg' }), 'tiny.jpg');
    const album = await fetchWithTimeout('https://cardscan.pokoin.com/identify-album?live=1&top_k=1', {
        method: 'POST',
        body: albumBody,
    });
    assert.equal(album.status, 200);
    const albumPayload = await album.json();
    assert.equal(albumPayload.ok, true);
    assert.equal(albumPayload.album, true);
    assert.equal(albumPayload.identity, 'public_id');
    assert.equal(albumPayload.catalog, 'pokemon_generic');
});
