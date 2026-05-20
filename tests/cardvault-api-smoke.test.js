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

test('16. first-edition Italian clue maps Gastly toward Base Set', async () => {
    const rows = await autocomplete('Gastly Base Set', { resultLimit: 5, poolLimit: 50 });

    assert.ok(rows.length > 0, 'Gastly Base Set should return candidates');
    assert.match(rows[0].name || '', /^Gastly$/i);
    assert.match(rows[0].set_name || '', /^Base Set$/i);
});
