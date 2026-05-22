// Pokoin/Cardvault API configuration for Pokemon Card Trader Linker
const POKOIN_API_BASE_URL = 'https://pokoin.com';

async function loadConfig() {
    console.log('✅ Pokoin API configuration loaded');
}

function absolutePokoinUrl(pathOrUrl = '') {
    const value = String(pathOrUrl || '').trim();
    if (!value) {
        return '';
    }
    if (/^https?:\/\//i.test(value)) {
        return value;
    }
    return `${POKOIN_API_BASE_URL}${value.startsWith('/') ? '' : '/'}${value}`;
}

function generateCardTraderLink(blueprintIdOrRow) {
    if (blueprintIdOrRow && typeof blueprintIdOrRow === 'object') {
        return blueprintIdOrRow.canonicalUrl ||
            blueprintIdOrRow.canonical_url ||
            blueprintIdOrRow.marketplaceUrl ||
            blueprintIdOrRow.marketplace_url ||
            absolutePokoinUrl(
                blueprintIdOrRow.canonicalPath ||
                blueprintIdOrRow.canonical_path ||
                blueprintIdOrRow.marketplacePath ||
                blueprintIdOrRow.marketplace_path
            ) ||
            (blueprintIdOrRow.card_id || blueprintIdOrRow.cardId || blueprintIdOrRow.blueprint_id || blueprintIdOrRow.blueprintId
                ? `https://pokoin.com/marketplace/en/cards/${blueprintIdOrRow.card_id || blueprintIdOrRow.cardId || blueprintIdOrRow.blueprint_id || blueprintIdOrRow.blueprintId}`
                : '');
    }
    return `https://pokoin.com/marketplace/en/cards/${blueprintIdOrRow}`;
}

loadConfig();
