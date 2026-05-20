// Pokoin/Cardvault API configuration for Pokemon Card Trader Linker
const POKOIN_API_BASE_URL = 'https://pokoin.com';

async function loadConfig() {
    console.log('✅ Pokoin API configuration loaded');
}

function generateCardTraderLink(blueprintId) {
    return `https://pokoin.com/marketplace/en/cards/${blueprintId}`;
}

loadConfig();
