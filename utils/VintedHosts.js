/** Every Vinted country marketplace. Overlay, host_permissions, and
 * web-accessible assets must include each host — not only .it/.com/.fr. */
const VINTED_MARKET_HOSTS = [
    'vinted.at',
    'vinted.be',
    'vinted.ca',
    'vinted.co.uk',
    'vinted.com',
    'vinted.com.au',
    'vinted.cz',
    'vinted.de',
    'vinted.dk',
    'vinted.ee',
    'vinted.es',
    'vinted.fi',
    'vinted.fr',
    'vinted.gr',
    'vinted.hr',
    'vinted.hu',
    'vinted.ie',
    'vinted.it',
    'vinted.lt',
    'vinted.lu',
    'vinted.lv',
    'vinted.nl',
    'vinted.pl',
    'vinted.pt',
    'vinted.ro',
    'vinted.se',
    'vinted.si',
    'vinted.sk',
];

function vintedMatchPatterns(hosts = VINTED_MARKET_HOSTS) {
    return hosts.flatMap((host) => [
        `https://${host}/*`,
        `https://*.${host}/*`,
    ]);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VINTED_MARKET_HOSTS,
        vintedMatchPatterns,
    };
}
