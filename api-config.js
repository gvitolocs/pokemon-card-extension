// Configurazione API CardTrader
const API_CONFIG = {
    // URL base dell'API v2
    baseURL: 'https://api.cardtrader.com/api/v2',
    
    // Token di autenticazione (da configurare dall'utente)
    authToken: 'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJjYXJkdHJhZGVyLXByb2R1Y3Rpb24iLCJzdWIiOiJhcHA6MTQyOTUiLCJhdWQiOiJhcHA6MTQyOTUiLCJleHAiOjQ5MDc5MzY5NjQsImp0aSI6ImJiYzYyNjc4LTY2OTYtNGZjOS1hZjI4LWE0ZGI0NmRkNTY5YyIsImlhdCI6MTc1MjI2MzM2NCwibmFtZSI6IlZpdG9sb2dpdXNlcHBlMTcgQXBwIDIwMjUwMzAyMTYxMDQ4In0.lJQQfmlXKZ_R5v7Iefu_EB4-cPEz9-2Ick4SQvhRso7tz-i7zaaRnjlAUhJcDHad-6tdreioSSFQr5YT0SQx8Bp7Rah6pgbJ49jPryCH1Ai9EpzdQEzj1nRgkEX7nHf9INcl56SCY9sf7iz0qQVKiIn3A0i984S3g2p_2PJlxlmUVkzf83Vea_vKtCD45shObGr8jOGRlcrNVoqj06FlPi6Of3N__cRi5vsfj7Mm7rWRBXyGhs7FOHGdff_3oL49Ux-dKDquPcVG6cYPWPQ-NSsST6Wh-7BJ8y6_AP7MpL1sKEpo1kETsigZJ4L1i8u4XHEfIyv4pHDUxyiutYLLcg',
    
    // Timeout per le richieste (in millisecondi)
    requestTimeout: 10000,
    
    // Intervallo di cache (in millisecondi)
    cacheTimeout: 5 * 60 * 1000, // 5 minuti
    
    // Numero massimo di risultati per ricerca
    maxResults: 25, // CardTrader v2 restituisce max 25 prodotti per blueprint
    
    // Headers predefiniti per le richieste
    defaultHeaders: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Pokemon-Card-Trader-Extension/1.1.0'
    },
    
    // Configurazione per il rate limiting (1 chiamata/secondo per marketplace)
    rateLimit: {
        maxRequests: 60, // Richieste massime per minuto (più conservativo)
        windowMs: 60 * 1000, // Finestra temporale in millisecondi
        marketplaceDelay: 1000 // 1 secondo tra chiamate marketplace
    },
    
    // Configurazione per il fallback
    fallback: {
        enabled: true,
        genericLink: 'https://www.cardtrader.com/pokemon',
        searchLink: 'https://www.cardtrader.com/catalog/search'
    },
    
    // ID del gioco Pokemon (da ottenere tramite /games)
    pokemonGameId: null
};

// Esporta per uso globale
window.API_CONFIG = API_CONFIG; 