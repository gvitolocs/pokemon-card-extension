const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const REPO_ROOT = path.resolve(__dirname, '..');

function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function extractFunctionSource(source, functionName, offset = 0) {
    const relativeStart = source.slice(offset).search(new RegExp(`(?:async\\s+)?function\\s+${functionName}\\b`));
    const start = relativeStart === -1 ? -1 : offset + relativeStart;
    assert.notEqual(start, -1, `${functionName} should exist`);

    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = bodyStart; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        if (depth === 0) {
            return source.slice(start, index + 1);
        }
    }

    throw new Error(`Unable to extract ${functionName}`);
}

function loadBackgroundHelpers(helperNames = []) {
    const source = readRepoFile('config/background.js');
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        document: { querySelector: () => null, querySelectorAll: () => [], title: '' },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true, json: async () => ({}) }),
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async (options) => {
                    const oldUrl = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Ascended-Heroes/Camerupt-ASC028';
                    const tab = options?.target?.tabId === 8 && extensionCalls === 0
                        ? {
                            title: 'Camerupt (ASC 028)',
                            url: oldUrl,
                            structuredCard: {
                                rawTitle: 'Camerupt (ASC 028)',
                                name: 'Camerupt',
                                searchName: 'Camerupt',
                                collectorNumber: 'ASC 028',
                                numericCollectorNumber: '028',
                                expansion: 'Ascended Heroes',
                            },
                        }
                        : {
                            title: 'Piplup (MEP 042)',
                            url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
                            structuredCard: {
                                rawTitle: 'Piplup (MEP 042)',
                                name: 'Piplup',
                                searchName: 'Piplup',
                                collectorNumber: 'MEP 042',
                                numericCollectorNumber: '042',
                                expansion: 'MEP Black Star Promos',
                            },
                        };
                    return [{ result: { ...tab, hostname: 'www.cardmarket.com' } }];
                },
            },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\n${helperNames.map((name) => `this.${name} = ${name};`).join('\n')}`, sandbox, { filename: 'config/background.js' });
    return sandbox;
}

function loadBackgroundMessageHarness(overrides = {}) {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storage = overrides.storage || {};
    const sandbox = {
        console: overrides.console || { log() {}, warn() {}, error() {} },
        document: { querySelector: () => null, querySelectorAll: () => [], title: '' },
        URL,
        setTimeout,
        clearTimeout,
        fetch: overrides.fetch || (async () => ({ ok: true, json: async () => ({}) })),
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                get: async () => ({}),
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
                ...(overrides.tabs || {}),
            },
            scripting: { executeScript: async () => [], ...(overrides.scripting || {}) },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') {
                            return { [key]: storage[key] };
                        }
                        if (Array.isArray(key)) {
                            return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        }
                        return { ...storage };
                    },
                    set: async (payload) => Object.assign(storage, payload),
                    ...(overrides.sessionStorage || {}),
                },
                local: { set: async () => {}, ...(overrides.localStorage || {}) },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }), ...(overrides.sidePanel || {}) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} }, ...(overrides.action || {}) },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });
    assert.equal(typeof messageListener, 'function', 'background should install a message listener');
    return {
        sandbox,
        storage,
        sendMessage: (request, sender = { tab: { id: 1, title: request.title || '', url: request.url || '' } }) =>
            new Promise((resolve) => messageListener(request, sender, resolve)),
    };
}

function loadPokoinAuthBridge(overrides = {}) {
    const source = readRepoFile('pokoin-auth-bridge.js');
    const messages = [];
    const postedMessages = [];
    let messageListener = null;
    const sandbox = {
        window: {
            location: {
                origin: 'https://pokoin.com',
                pathname: '/extension/auth-bridge',
            },
            addEventListener(type, listener) {
                if (type === 'message') {
                    messageListener = listener;
                }
            },
            postMessage(message, targetOrigin) {
                postedMessages.push({ message, targetOrigin });
            },
            ...(overrides.window || {}),
        },
        chrome: {
            runtime: {
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true };
                },
            },
            ...(overrides.chrome || {}),
        },
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'pokoin-auth-bridge.js' });
    assert.equal(typeof messageListener, 'function', 'Pokoin auth bridge should install a message listener');
    return { sandbox, messages, postedMessages, messageListener };
}

function loadProcessor(relativePath, className, overrides = {}) {
    const source = readRepoFile(relativePath);
    const defaultWindow = {
        location: { href: 'https://example.test/item', hostname: 'example.test', pathname: '/item' },
        addEventListener() {},
        dispatchEvent() {},
    };
    const sandbox = {
        console: {
            log() {},
            warn: overrides.warn || (() => {}),
            error: overrides.error || (() => {}),
        },
        window: Object.assign(defaultWindow, overrides.window || {}),
        document: overrides.document || {
            querySelectorAll: () => [],
            contains: () => true,
            createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }),
            body: { appendChild() {} },
        },
        chrome: overrides.chrome || {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async () => ({ success: true, results: [] }),
            },
        },
        MutationObserver: overrides.MutationObserver || class {
            observe() {}
        },
        Node: { ELEMENT_NODE: 1 },
        URL,
        Event: class {
            constructor(type) {
                this.type = type;
            }
        },
        history: overrides.history || {
            pushState() {},
            replaceState() {},
        },
        setTimeout: overrides.setTimeout || setTimeout,
        clearTimeout: overrides.clearTimeout || clearTimeout,
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.ExportedProcessor = ${className};`, sandbox, { filename: relativePath });
    return { Processor: sandbox.ExportedProcessor, sandbox };
}

function createButtonStub() {
    return {
        style: { cssText: '' },
        attributes: {},
        tagName: 'BUTTON',
        parentNode: {
            replaceChild(newNode) {
                newNode.parentNode = this;
            },
        },
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        removeAttribute(name) {
            delete this.attributes[name];
        },
        querySelector() {
            return { style: {} };
        },
        addEventListener() {},
        cloneNode() {
            const clone = createButtonStub();
            clone.style = { ...this.style };
            clone.attributes = { ...this.attributes };
            return clone;
        },
        getBoundingClientRect() {
            return { bottom: 140, right: 300 };
        },
    };
}

function createDomElement(tagName = 'div', attributes = {}) {
    const element = {
        tagName: tagName.toUpperCase(),
        nodeType: 1,
        style: { cssText: '' },
        attributes: { ...attributes },
        children: [],
        textContent: '',
        parentNode: null,
        parentElement: null,
        nextSibling: null,
        type: '',
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
        removeAttribute(name) {
            delete this.attributes[name];
        },
        getAttribute(name) {
            return this.attributes[name];
        },
        appendChild(child) {
            child.parentNode = this;
            child.parentElement = this;
            this.children.push(child);
            this.updateSiblings();
            return child;
        },
        append(...children) {
            children.forEach((child) => this.appendChild(child));
        },
        remove() {
            if (this.parentNode?.children) {
                this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
                this.parentNode.updateSiblings?.();
            }
            this.parentNode = null;
            this.parentElement = null;
        },
        attachShadow() {
            const root = createDomElement('#shadow-root');
            root.host = this;
            this.shadowRoot = root;
            return root;
        },
        prepend(child) {
            child.parentNode = this;
            child.parentElement = this;
            this.children.unshift(child);
            this.updateSiblings();
            return child;
        },
        insertBefore(child, before) {
            child.parentNode = this;
            child.parentElement = this;
            const index = this.children.indexOf(before);
            if (index === -1) {
                this.children.push(child);
            } else {
                this.children.splice(index, 0, child);
            }
            this.updateSiblings();
            return child;
        },
        replaceChild(newChild, oldChild) {
            const index = this.children.indexOf(oldChild);
            if (index === -1) {
                return oldChild;
            }
            newChild.parentNode = this;
            newChild.parentElement = this;
            oldChild.parentNode = null;
            oldChild.parentElement = null;
            this.children.splice(index, 1, newChild);
            this.updateSiblings();
            return oldChild;
        },
        updateSiblings() {
            this.children.forEach((child, index, children) => {
                child.nextSibling = children[index + 1] || null;
            });
        },
        addEventListener(type, listener) {
            this.eventListeners = this.eventListeners || {};
            this.eventListeners[type] = listener;
        },
        cloneNode() {
            const clone = createDomElement(tagName, { ...this.attributes });
            clone.style = { ...this.style };
            clone.textContent = this.textContent;
            clone.innerHTML = this.innerHTML;
            if (arguments[0] === true) {
                this.children.forEach((child) => clone.appendChild(child.cloneNode?.(true) || child));
            }
            return clone;
        },
        querySelector(selector) {
            for (const child of this.children) {
                if (child.matches?.(selector)) {
                    return child;
                }
                const descendant = child.querySelector?.(selector);
                if (descendant) {
                    return descendant;
                }
            }
            return null;
        },
        querySelectorAll(selector) {
            return this.children.flatMap((child) => {
                const matches = child.matches?.(selector) ? [child] : [];
                return [...matches, ...(child.querySelectorAll?.(selector) || [])];
            });
        },
        contains(target) {
            return target === this || this.children.some((child) => child.contains?.(target));
        },
        matches(selector) {
            if (selector.includes(',')) {
                return selector.split(',').some((part) => this.matches(part.trim()));
            }
            if (/^[^\[]+\s+/.test(selector)) {
                const [ancestorSelector, ...descendantParts] = selector.split(/\s+/);
                const descendantSelector = descendantParts.join(' ');
                return this.matches(descendantSelector) && Boolean(this.parentElement?.closest?.(ancestorSelector));
            }
            if (/^[a-z]+\[data-testid="[^"]+"\]$/i.test(selector)) {
                const [tagSelector] = selector.split('[');
                const expectedTestId = selector.match(/\[data-testid="([^"]+)"\]/)?.[1];
                return this.tagName === tagSelector.toUpperCase() && this.attributes['data-testid'] === expectedTestId;
            }
            if (/^[a-z]+\.[\w-]+(?:__[\w-]+)*/i.test(selector)) {
                const [tagSelector, ...classParts] = selector.split('.');
                const expectedClass = classParts.join('.');
                return this.tagName === tagSelector.toUpperCase() && String(this.attributes.class || '').split(/\s+/).includes(expectedClass);
            }
            const testId = selector.match(/\[data-testid="([^"]+)"\]/)?.[1];
            if (testId) {
                return this.attributes['data-testid'] === testId;
            }
            const partialTestId = selector.match(/\[data-testid\*="([^"]+)"\]/)?.[1];
            if (partialTestId) {
                return String(this.attributes['data-testid'] || '').includes(partialTestId);
            }
            if (selector === tagName || selector.toUpperCase() === this.tagName) {
                return true;
            }
            if (selector.startsWith('[class*="')) {
                const classFragment = selector.match(/\[class\*="([^"]+)"\]/)?.[1] || '';
                return String(this.attributes.class || '').includes(classFragment);
            }
            if (selector.startsWith('.')) {
                const expectedClass = selector.slice(1);
                return String(this.attributes.class || '').split(/\s+/).includes(expectedClass);
            }
            if (selector.startsWith('[data-pokoin-vinted-panel]')) {
                return this.attributes['data-pokoin-vinted-panel'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-vinted-panel-host]')) {
                return this.attributes['data-pokoin-vinted-panel-host'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-ebay-panel]')) {
                return this.attributes['data-pokoin-ebay-panel'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-ebay-panel-host]')) {
                return this.attributes['data-pokoin-ebay-panel-host'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-extension-panel]')) {
                const expected = selector.match(/\[data-pokoin-extension-panel="([^"]+)"\]/)?.[1];
                if (expected) {
                    return this.attributes['data-pokoin-extension-panel'] === expected;
                }
                return this.attributes['data-pokoin-extension-panel'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-vinted-keywords]')) {
                return this.attributes['data-pokoin-vinted-keywords'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-candidate-preview]')) {
                return this.attributes['data-pokoin-candidate-preview'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-vinted-collapse-toggle]')) {
                return this.attributes['data-pokoin-vinted-collapse-toggle'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-vinted-header-row]')) {
                return this.attributes['data-pokoin-vinted-header-row'] !== undefined;
            }
            if (selector.startsWith('[data-pokemon-linker-button]')) {
                return this.attributes['data-pokemon-linker-button'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-vinted-keyword]')) {
                return this.attributes['data-pokoin-vinted-keyword'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-vinted-manual-clue-input]')) {
                return this.attributes['data-pokoin-vinted-manual-clue-input'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-ebay-keyword]')) {
                return this.attributes['data-pokoin-ebay-keyword'] !== undefined;
            }
            if (selector.startsWith('[data-pokoin-ebay-manual-clue-input]')) {
                return this.attributes['data-pokoin-ebay-manual-clue-input'] !== undefined;
            }
            return false;
        },
        closest(selector) {
            let current = this;
            while (current) {
                if (current.matches?.(selector)) {
                    return current;
                }
                current = current.parentElement || current.parentNode;
            }
            return null;
        },
    };
    return element;
}

function createClassListStub() {
    const classes = new Set();
    return {
        classes,
        add(name) {
            classes.add(name);
        },
        remove(name) {
            classes.delete(name);
        },
        toggle(name, force) {
            const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
            if (shouldAdd) {
                classes.add(name);
            } else {
                classes.delete(name);
            }
            return shouldAdd;
        },
        contains(name) {
            return classes.has(name);
        },
    };
}

test('content search fetch failures are quiet and return empty results', async () => {
    const source = readRepoFile('content.js');
    const globalSearchStart = source.indexOf('// Search cards in database');
    const helperStart = source.indexOf('let contentSearchFallbackNoticeShown');
    const helperSource = source.slice(helperStart, globalSearchStart);
    const extracted = extractFunctionSource(source, 'searchCardInDatabase', globalSearchStart);
    const errors = [];
    const warnings = [];
    const infos = [];
    const sandbox = {
        console: {
            error: (...args) => errors.push(args),
            warn: (...args) => warnings.push(args),
            info: (...args) => infos.push(args),
            log() {},
        },
        enrichTitleInfoWithCardvaultName: async (titleInfo) => titleInfo,
        searchPokoinCardApi: async () => {
            throw new TypeError('Failed to fetch');
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${helperSource}\n${extracted}\nthis.searchCardInDatabase = searchCardInDatabase;`, sandbox);

    const results = await sandbox.searchCardInDatabase({ pokemonName: 'Dragonite', isVCard: true }, 'Dragonite V Fullart Pokemon');
    const repeatedResults = await sandbox.searchCardInDatabase({ pokemonName: 'Dragonite', isVCard: true }, 'Dragonite V Fullart Pokemon');

    assert.ok(Array.isArray(results));
    assert.equal(results.length, 0);
    assert.ok(Array.isArray(repeatedResults));
    assert.equal(repeatedResults.length, 0);
    assert.equal(errors.length, 0, 'expected fetch failures should not use console.error');
    assert.equal(warnings.length, 0, 'expected fetch failure should not spam warnings');
    assert.equal(infos.length, 1, 'expected fetch failure should emit one quiet diagnostic');
    assert.match(String(infos[0][0]), /Content search unavailable/);
});

test('Vinted falls back to background without error spam', async () => {
    const errors = [];
    const warnings = [];
    const chromeMessages = [];
    let contentSearchCalls = 0;
    const { Processor, sandbox } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        error: (...args) => errors.push(args),
        warn: (...args) => warnings.push(args),
        window: {
            location: { href: 'https://www.vinted.it/items/1-dragonite-v', hostname: 'www.vinted.it' },
            searchCardInDatabase: async () => {
                contentSearchCalls += 1;
                throw new TypeError('Failed to fetch');
            },
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    chromeMessages.push(message);
                    return {
                        success: true,
                        results: [{ name_en: 'Dragonite V', search_score: 92, blueprint_id: 123 }],
                    };
                },
            },
        },
    });

    const processor = new Processor();
    processor.currentTitle = 'Dragonite V Fullart Pokemon';
    processor.currentButton = createButtonStub();
    processor.renderCandidatePreview = () => {};
    await processor.runVintedSearch({ pokemonName: 'Dragonite' }, 'Dragonite V Fullart Pokemon');

    assert.equal(contentSearchCalls, 0, 'Vinted should not call noisy content fetch path for preview search');
    assert.equal(processor.currentButton.attributes['data-pokemon-linker-fallback'], undefined);
    assert.equal(errors.length, 0, 'expected content fetch failures should not be logged as errors');
    assert.equal(warnings.length, 0, 'background-first Vinted search should not warn on content fetch');
    assert.equal(chromeMessages.filter((message) => message.action === 'searchCardForTitle').length, 1);
    assert.equal(chromeMessages.at(-1).action, 'marketplacePreviewReady');
    assert.equal(sandbox.window.VintedProcessor, Processor);
});

function createVintedProductDom() {
    const details = createDomElement('section', { 'data-testid': 'item-details' });
    const title = createDomElement('h1', { 'data-testid': 'item-title' });
    const description = createDomElement('p', { 'data-testid': 'item-description' });
    const actionArea = createDomElement('div', { 'data-testid': 'item-actions' });
    title.textContent = 'Carta Pokemon Reshiram';
    description.textContent = 'Reshiram card SWSH154 Evolving Skies 192/203';
    details.appendChild(title);
    details.appendChild(description);
    details.appendChild(actionArea);
    return { details, title, description, actionArea };
}

test('Vinted process renders button, clue chips, and candidate preview once', async () => {
    const { details, title, description } = createVintedProductDom();
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: {
                href: 'https://www.vinted.it/items/10-reshiram?ref=feed#photo',
                hostname: 'www.vinted.it',
                pathname: '/items/10-reshiram',
            },
            extractTitleInfo: (value) => ({
                pokemonName: /^reshiram$/i.test(String(value || '').replace(/carta pokemon/i, '').trim()) ? 'Reshiram' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return {
                        success: true,
                        results: [{ name_en: 'Reshiram', search_score: 94, collector_number: 'SWSH154' }],
                    };
                },
            },
        },
        document: {
            querySelector: (selector) => {
                if (selector === '[data-testid="item-description"]') return description;
                if (selector === '[data-pokoin-vinted-panel-host]') return details.querySelector(selector);
                if (selector === '[data-testid="item-details"]') return details;
                return null;
            },
            querySelectorAll: (selector) => {
                if (selector.includes('h1') || selector === '[data-testid="item-title"]') {
                    return [title].filter((element) => element.matches(selector) || selector === 'h1');
                }
                if (selector === '[data-pokoin-vinted-panel-host]') {
                    return details.querySelectorAll(selector);
                }
                return [];
            },
            contains: (element) => details.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            documentElement: details,
            body: details,
        },
    });
    const processor = new Processor();

    processor.processProductPage();
    await Promise.resolve();
    await processor.inFlightSearches.values().next().value;
    await Promise.resolve();
    processor.processProductPage();

    const host = details.querySelector('[data-pokoin-vinted-panel-host]');
    const panel = host.shadowRoot.querySelector('[data-pokoin-vinted-panel]');
    assert.equal(panel.querySelectorAll('[data-pokemon-linker-button]').length, 1);
    assert.ok(panel.querySelectorAll('[data-pokoin-vinted-keyword]').length > 0, 'clue chips should render');
    assert.equal(panel.querySelectorAll('[data-pokoin-candidate-preview]').length, 1);
    assert.equal(processor.currentButton.style.background, '#0ea5e9');
    assert.equal(host.attributes['data-pokoin-vinted-placement'], 'overlay-fixed');
    assert.equal(host.parentNode, details, 'test body receives overlay host');
    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 1);
});

test('Vinted catalogue search stays quiet and SPA item navigation remounts overlay', async () => {
    const body = createDomElement('main');
    const catalogueTitle = createDomElement('h1', { 'data-testid': 'catalog-title' });
    catalogueTitle.textContent = 'Flareon';
    body.appendChild(catalogueTitle);
    const { details, title, description } = createVintedProductDom();
    title.textContent = 'Carta Pokemon Flareon';
    description.textContent = 'Flareon EX 10/108';
    const location = {
        href: 'https://www.vinted.it/catalog?search_text=flareon&search_by_image_uuid=&search_by_image_id=&page=1&time=123',
        hostname: 'www.vinted.it',
        pathname: '/catalog',
    };
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location,
            extractTitleInfo: (value) => ({
                pokemonName: /flareon/i.test(String(value || '')) ? 'Flareon' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [{ name_en: 'Flareon EX', search_score: 95 }] };
                },
            },
        },
        document: {
            querySelector: (selector) => {
                if (selector === '[data-testid="item-description"]') return location.pathname.startsWith('/items/') ? description : null;
                if (selector === '[data-pokoin-vinted-panel-host]') return body.querySelector(selector);
                if (selector === '[data-testid="item-details"]') return location.pathname.startsWith('/items/') ? details : null;
                return body.querySelector(selector);
            },
            querySelectorAll: (selector) => {
                if (selector === '[data-pokoin-vinted-panel-host]') return body.querySelectorAll(selector);
                if (selector.includes('h1') || selector === '[data-testid="item-title"]') {
                    const activeTitle = location.pathname.startsWith('/items/') ? title : catalogueTitle;
                    return [activeTitle].filter((element) => element.matches(selector) || selector === 'h1');
                }
                return body.querySelectorAll(selector);
            },
            contains: (element) => body.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            documentElement: body,
            body,
        },
    });
    const processor = new Processor();

    processor.processProductPage();
    processor.processProductPage();

    assert.equal(body.querySelector('[data-pokoin-vinted-panel-host]'), null);
    assert.equal(body.querySelectorAll('[data-pokemon-linker-button]').length, 0);
    assert.equal(body.querySelectorAll('[data-pokoin-vinted-keywords]').length, 0);
    assert.equal(body.querySelectorAll('[data-pokoin-candidate-preview]').length, 0);
    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 0);
    assert.equal(
        processor.vintedDiagnostics.filter((entry) => entry.event === 'catalogue-warmup').length,
        1,
        'catalogue search_text should be parsed once without repeated listing searches'
    );

    location.href = 'https://www.vinted.it/items/77-flareon-ex';
    location.pathname = '/items/77-flareon-ex';
    body.children = [];
    body.appendChild(details);
    processor.processProductPage();
    await Promise.resolve();
    await processor.inFlightSearches.values().next().value;
    await Promise.resolve();

    const itemHost = body.querySelector('[data-pokoin-vinted-panel-host]');
    assert.ok(itemHost, 'product navigation should mount the Vinted overlay');
    assert.equal(itemHost.shadowRoot.querySelectorAll('[data-pokemon-linker-button]').length, 1);
    assert.equal(itemHost.shadowRoot.querySelectorAll('[data-pokoin-candidate-preview]').length, 1);
    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 1);

    location.href = 'https://www.vinted.it/catalog?search_text=flareon&page=2';
    location.pathname = '/catalog';
    body.appendChild(catalogueTitle);
    processor.processProductPage();
    processor.processProductPage();

    assert.equal(body.querySelector('[data-pokoin-vinted-panel-host]'), null, 'returning to catalogue should remove the product overlay');
    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 1, 'catalogue revisits should not trigger listing search');
});

test('Vinted search and overlay mount without details anchor', async () => {
    const details = createDomElement('section', { 'data-testid': 'item-details' });
    const earlyTitle = createDomElement('h1', { 'data-testid': 'item-title' });
    earlyTitle.textContent = 'Carta Pokemon Reshiram';
    const description = createDomElement('p', { 'data-testid': 'item-description' });
    description.textContent = 'Reshiram card SWSH154';
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: {
                href: 'https://www.vinted.it/items/30-reshiram',
                hostname: 'www.vinted.it',
                pathname: '/items/30-reshiram',
            },
            extractTitleInfo: () => ({ pokemonName: 'Reshiram' }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [{ name_en: 'Reshiram', search_score: 95 }] };
                },
            },
        },
        document: {
            querySelector: (selector) => {
                if (selector === '[data-testid="item-description"]') return description;
                if (selector === '[data-pokoin-vinted-panel-host]') return details.querySelector(selector);
                if (selector === '[data-testid="item-details"]') return null;
                return null;
            },
            querySelectorAll: (selector) => {
                if (selector.includes('h1') || selector === '[data-testid="item-title"]') {
                    return [earlyTitle].filter((element) => element.matches(selector) || selector === 'h1');
                }
                if (selector === '[data-pokoin-vinted-panel-host]') {
                    return details.querySelectorAll(selector);
                }
                return [];
            },
            contains: (element) => details.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            documentElement: details,
            body: details,
        },
        setTimeout: () => 1,
    });
    const processor = new Processor();

    processor.processProductPage();
    await Promise.resolve();
    await processor.inFlightSearches.values().next().value;
    await Promise.resolve();

    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 1);
    assert.ok(processor.currentButton, 'overlay UI should mount from title/description alone');
    assert.equal(processor.currentPanelHost.attributes['data-pokoin-vinted-placement'], 'overlay-fixed');
    assert.equal(processor.currentButton.style.background, '#0ea5e9');
    assert.ok(processor.vintedDiagnostics.some((entry) => entry.event === 'ui-mount' && /overlay/.test(entry.reason)));
});

test('Vinted diagnostics record duplicate same-listing skips', async () => {
    const { details, title, description } = createVintedProductDom();
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: {
                href: 'https://www.vinted.it/items/31-reshiram?ref=feed',
                hostname: 'www.vinted.it',
                pathname: '/items/31-reshiram',
            },
            extractTitleInfo: () => ({ pokemonName: 'Reshiram' }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [{ name_en: 'Reshiram', search_score: 91 }] };
                },
            },
        },
        document: {
            querySelector: (selector) => {
                if (selector === '[data-testid="item-description"]') return description;
                if (selector === '[data-pokoin-vinted-panel-host]') return details.querySelector(selector);
                if (selector === '[data-testid="item-details"]') return details;
                return null;
            },
            querySelectorAll: (selector) => {
                if (selector.includes('h1') || selector === '[data-testid="item-title"]') {
                    return [title].filter((element) => element.matches(selector) || selector === 'h1');
                }
                if (selector === '[data-pokoin-vinted-panel-host]') return details.querySelectorAll(selector);
                return [];
            },
            contains: (element) => details.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            documentElement: details,
            body: details,
        },
    });
    const processor = new Processor();

    processor.processProductPage();
    await Promise.resolve();
    await processor.inFlightSearches.values().next().value;
    await Promise.resolve();
    processor.processProductPage();

    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 1);
    const duplicate = processor.vintedDiagnostics.find((entry) => entry.event === 'process-skip');
    assert.equal(duplicate.skippedDuplicateReason, 'same listing already mounted');
    assert.equal(duplicate.uiMounted, true);
    assert.match(duplicate.listingKey, /\/items\/31-reshiram$/);
});

test('Vinted rerender reinsertion does not search again unless clues change', async () => {
    const { details, title, description } = createVintedProductDom();
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: {
                href: 'https://www.vinted.it/items/11-reshiram',
                hostname: 'www.vinted.it',
                pathname: '/items/11-reshiram',
            },
            extractTitleInfo: (value) => ({
                pokemonName: /^reshiram$/i.test(String(value || '').replace(/carta pokemon/i, '').trim()) ? 'Reshiram' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [{ name_en: 'Reshiram', search_score: 91 }] };
                },
            },
        },
        document: {
            querySelector: (selector) => {
                if (selector === '[data-testid="item-description"]') return description;
                if (selector === '[data-pokoin-vinted-panel-host]') return details.querySelector(selector);
                if (selector === '[data-testid="item-details"]') return details;
                return null;
            },
            querySelectorAll: (selector) => {
                if (selector.includes('h1') || selector === '[data-testid="item-title"]') {
                    return [title].filter((element) => element.matches(selector) || selector === 'h1');
                }
                if (selector === '[data-pokoin-vinted-panel-host]') {
                    return details.querySelectorAll(selector);
                }
                return [];
            },
            contains: (element) => details.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            documentElement: details,
            body: details,
        },
    });
    const processor = new Processor();

    processor.processProductPage();
    await Promise.resolve();
    await processor.inFlightSearches.values().next().value;
    await Promise.resolve();
    const host = processor.currentPanelHost;
    host.remove();
    processor.ensureVintedPanel(title);
    processor.processProductPage();
    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 1);

    const inactiveChip = processor.currentPanel.querySelectorAll('[data-pokoin-vinted-keyword]')
        .find((chip) => chip.attributes['aria-pressed'] === 'false');
    assert.ok(inactiveChip, 'a manual clue chip should be available to toggle');
    inactiveChip.eventListeners.click({
        preventDefault() {},
        stopPropagation() {},
    });
    await Promise.resolve();
    await processor.inFlightSearches.values().next().value;
    await Promise.resolve();

    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 2);
    assert.equal(inactiveChip.attributes['aria-pressed'], 'true');
});

test('Vinted new listing URL resets duplicate guard and searches once', async () => {
    const { details, title, description } = createVintedProductDom();
    const messages = [];
    const location = {
        href: 'https://www.vinted.it/items/12-reshiram?foo=1',
        hostname: 'www.vinted.it',
        pathname: '/items/12-reshiram',
    };
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location,
            extractTitleInfo: () => ({ pokemonName: 'Reshiram' }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [{ name_en: 'Reshiram', search_score: 91 }] };
                },
            },
        },
        document: {
            querySelector: (selector) => {
                if (selector === '[data-testid="item-description"]') return description;
                if (selector === '[data-pokoin-vinted-panel-host]') return details.querySelector(selector);
                if (selector === '[data-testid="item-details"]') return details;
                return null;
            },
            querySelectorAll: (selector) => {
                if (selector.includes('h1') || selector === '[data-testid="item-title"]') {
                    return [title].filter((element) => element.matches(selector) || selector === 'h1');
                }
                if (selector === '[data-pokoin-vinted-panel-host]') {
                    return details.querySelectorAll(selector);
                }
                return [];
            },
            contains: (element) => details.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            documentElement: details,
            body: details,
        },
    });
    const processor = new Processor();

    processor.processProductPage();
    await Promise.resolve();
    await processor.inFlightSearches.values().next().value;
    await Promise.resolve();
    location.href = 'https://www.vinted.it/items/12-reshiram?foo=2#photo';
    processor.processProductPage();
    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 1, 'query/hash-only URL changes should not search again');

    location.href = 'https://www.vinted.it/items/13-reshiram';
    location.pathname = '/items/13-reshiram';
    title.textContent = 'Carta Pokemon Reshiram nuova';
    processor.processProductPage();
    await Promise.resolve();
    await processor.inFlightSearches.values().next().value;
    await Promise.resolve();
    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 2, 'new listing URL should search once');
});

test('Vinted description keywords ignore generic card words and keep useful clues', () => {
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor');
    const processor = new Processor();

    const keywords = processor.extractVintedKeywords(
        'Carta Pokemon Dragonite V',
        'Card in ottime condizioni. Carte promo SWSH154 Evolving Skies 192/203 holo.'
    );
    const labels = keywords.map((keyword) => keyword.label.toLowerCase());
    const compactLabels = labels.map((label) => processor.compactClueValue(label));

    assert.equal(labels.includes('carta'), false);
    assert.equal(labels.includes('carte'), false);
    assert.equal(labels.includes('card'), false);
    assert.equal(labels.includes('cards'), false);
    assert.ok(compactLabels.includes('swsh154'), 'promo code should be extracted');
    assert.ok(labels.includes('evolving skies'), 'expansion should be extracted');
    assert.ok(labels.includes('192/203'), 'collector number should be extracted');
});

test('Vinted collector codes stay atomic and suppress noisy partial chips', () => {
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor');
    const processor = new Processor();

    const keywords = processor.extractVintedKeywords(
        'Landorus AR SV 11b 137',
        'Appena sbustata, carta Pokemon in perfette condizioni. Altro codice 35/108.'
    );
    const labels = keywords.map((keyword) => keyword.label);
    const lowerLabels = labels.map((label) => label.toLowerCase());

    assert.ok(labels.includes('SV 11b 137'), 'full collector code should be one chip');
    assert.ok(labels.includes('35/108'), 'slash collector number should stay one chip');
    assert.equal(lowerLabels.includes('11b 137'), false);
    assert.equal(lowerLabels.includes('137 appena'), false);
    assert.equal(lowerLabels.includes('11b 137 appena'), false);
});

test('Vinted Lapras bare collector number is atomic and keeps illustration visible', () => {
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            extractTitleInfo: (title) => ({
                pokemonName: /^lapras$/i.test(String(title || '').replace(/\b(?:it|ita|appena|sbustata)\b/gi, '').trim()) ? 'Lapras' : null,
            }),
        },
    });
    const processor = new Processor();

    const keywords = processor.extractVintedKeywords(
        'Pokemon carta Lapras it 194',
        '194 appena sbustata, condizioni ottime'
    );
    const labels = keywords.map((keyword) => keyword.label);
    const lowerLabels = labels.map((label) => label.toLowerCase());

    assert.ok(labels.includes('Lapras'), 'card name should be visible');
    assert.ok(labels.includes('194'), 'bare collector number should be a standalone chip');
    assert.ok(labels.includes('illustration'), 'manual illustration chip should not be truncated');
    assert.equal(lowerLabels.includes('it 194'), false);
    assert.equal(lowerLabels.includes('194 appena'), false);
    assert.equal(keywords.find((keyword) => keyword.label === '194')?.category, 'collector');
    assert.equal(keywords.find((keyword) => keyword.label === 'illustration')?.selectedByDefault, false);
});

test('Vinted Rocket Zapdos keeps composite card name primary with collector', () => {
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/15-rocket-zapdos', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /zapdos/i.test(String(title || '')) ? 'Zapdos' : '',
            }),
        },
    });
    const processor = new Processor();
    const title = 'Rocket Zapdos 15/132';

    processor.currentTitle = title;
    processor.prepareVintedKeywords(title, '');
    const labels = processor.currentKeywords.map((keyword) => keyword.label);
    const selectedLabels = processor.selectedKeywordLabels();
    const primaryClues = processor.selectedPrimaryClues(selectedLabels);
    const payload = processor.buildVintedPayload(title, selectedLabels);

    assert.ok(labels.includes('Rocket Zapdos'), 'composite card name chip should render');
    assert.ok(labels.includes('Zapdos'), 'generic species chip can remain visible');
    assert.ok(labels.includes('15/132'), 'collector chip should render');
    assert.ok(selectedLabels.includes('Rocket Zapdos'), 'composite card name should be selected');
    assert.equal(selectedLabels.includes('Zapdos'), false, 'generic species should be shadowed by composite name');
    assert.deepEqual([...primaryClues], ['Rocket Zapdos']);
    assert.equal(payload.name, 'Rocket Zapdos');
    assert.equal(payload.collectorNumber, '15/132');
    assert.equal(payload.numericCollectorNumber, '15');
    assert.equal(payload.variation, '');
    assert.deepEqual([...payload.primaryClues], ['Rocket Zapdos']);
});

test('Vinted Holon Transceiver keeps full trainer name primary with collector', () => {
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/98-holon-transceiver', hostname: 'www.vinted.it' },
            extractTitleInfo: () => ({ pokemonName: null }),
        },
    });
    const processor = new Processor();
    const title = 'Delta Species: Holon Transceiver [98]';

    processor.currentTitle = title;
    processor.prepareVintedKeywords(title, '');
    const labels = processor.currentKeywords.map((keyword) => keyword.label);
    const selectedLabels = processor.selectedKeywordLabels();
    const primaryClues = processor.selectedPrimaryClues(selectedLabels);
    const payload = processor.buildVintedPayload(title, selectedLabels);

    assert.ok(labels.includes('Holon Transceiver'), 'full trainer item name chip should render');
    assert.ok(labels.includes('98') || labels.includes('Holon Transceiver 98'), 'collector evidence should render');
    assert.ok(selectedLabels.includes('Holon Transceiver'), 'full trainer item name should be selected');
    assert.equal(selectedLabels.includes('Transceiver'), false, 'suffix token should be shadowed by full phrase');
    assert.deepEqual([...primaryClues], ['Holon Transceiver', 'Delta Species']);
    assert.equal(payload.name, 'Holon Transceiver');
    assert.ok(/\b98\b/.test(payload.collectorNumber));
    assert.equal(payload.numericCollectorNumber, '98');
    assert.ok(payload.selectedClues.includes('Delta Species'), 'delta context should remain selected');
    assert.deepEqual([...payload.primaryClues], ['Holon Transceiver', 'Delta Species']);
    assert.match(payload.searchTitle, /Holon Transceiver\b.*\b98\b/);
    assert.doesNotMatch(payload.searchTitle, /\bXtransceiver\b/i);
});

test('Vinted illustration chip is always visible and only auto-selected from title hint', () => {
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            extractTitleInfo: (title) => ({
                pokemonName: /landorus/i.test(String(title || '')) ? 'Landorus' : null,
            }),
        },
    });
    const processor = new Processor();

    const withoutHint = processor.extractVintedKeywords('Landorus AR SV 11b 137', 'Appena sbustata');
    const manualIllustration = withoutHint.find((keyword) => keyword.label === 'illustration');
    assert.ok(manualIllustration, 'illustration chip should always render');
    assert.equal(manualIllustration.selectedByDefault, false);

    const withTitleHint = processor.extractVintedKeywords('Landorus AR Full Art', 'Appena sbustata');
    const selectedIllustration = withTitleHint.find((keyword) => keyword.label === 'illustration');
    assert.ok(selectedIllustration, 'illustration chip should render with title hint');
    assert.equal(selectedIllustration.selectedByDefault, true);
});

test('Vinted scrapes provided product HTML selectors for title and description', () => {
    const details = createDomElement('section', {
        class: 'box--item-details',
        itemtype: 'https://schema.org/Product',
        'data-testid': 'item-page-summary-plugin',
    });
    const title = createDomElement('h1', { class: 'web_ui__Text__title' });
    const description = createDomElement('div', { itemprop: 'description' });
    title.textContent = 'Regigigas Vastro Pokémon';
    description.textContent = 'Carta Regigigas Vastro Astral Radiance 114/189';
    details.appendChild(title);
    details.appendChild(description);

    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelector: (selector) => {
                if (selector === '[itemprop="description"]') return description;
                if (selector === '[data-pokoin-vinted-panel-host]') return null;
                if (selector === '.box--item-details') return details;
                return details.querySelector(selector);
            },
            querySelectorAll: (selector) => {
                if (selector.includes('h1') || selector === '[data-testid="item-title"]') {
                    return [title].filter((element) => element.matches(selector) || selector === 'h1');
                }
                return details.querySelectorAll(selector);
            },
            contains: (element) => details.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            documentElement: details,
            body: details,
        },
    });
    const processor = new Processor();
    const source = processor.resolveVintedSearchSource();

    assert.equal(source.title, 'Regigigas Vastro Pokémon');
    assert.equal(source.description, 'Carta Regigigas Vastro Astral Radiance 114/189');
    assert.equal(source.detailsContainer, details);
});

test('Vinted normalizes Vastro typo to preselected VSTAR in clues and payload', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/32-regigigas', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /regigigas/i.test(String(title || '')) ? 'Regigigas' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Reggigas Vastro carta Pokemon';
    processor.currentKeywords = processor.extractVintedKeywords(
        processor.currentTitle,
        'Regigigas Vastro promo'
    );
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const labels = processor.currentKeywords.map((keyword) => keyword.label.toLowerCase());
    assert.ok(labels.includes('vstar'));
    assert.equal(labels.includes('vastro'), false);
    assert.equal(processor.currentKeywords.find((keyword) => keyword.compact === 'vstar').selectedByDefault, true);
    assert.match(messages[0].title, /vstar/i);
    assert.doesNotMatch(messages[0].title, /vastro/i);
    assert.ok(messages[0].clues.some((clue) => /^vstar$/i.test(clue)));
    assert.ok(messages[0].primaryClues.some((clue) => /^vstar$/i.test(clue)));
});

test('Vinted Regice Ex defaults only name phrase and attached variation', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/33-regice-ex', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /regice/i.test(String(title || '')) ? 'Regice' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Regice Ex vintage Set Ex';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const selectedLabels = processor.selectedKeywordLabels();
    assert.deepEqual(Array.from(selectedLabels), ['Regice ex', 'ex']);
    assert.equal(processor.currentKeywords.find((keyword) => /^vintage$/i.test(keyword.label))?.selectedByDefault, false);
    assert.equal(processor.currentKeywords.find((keyword) => /^Set ex$/i.test(keyword.label))?.selectedByDefault, false);
    assert.deepEqual(Array.from(messages[0].clues), ['Regice ex', 'ex']);
    assert.deepEqual(Array.from(messages[0].primaryClues), ['Regice ex', 'ex']);
    assert.equal(messages[0].title, 'Regice ex');
    assert.doesNotMatch(messages[0].title, /vintage|Set Ex/i);
});

test('Vinted normalizes Magaerna ex typo to Magearna structured payload', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/75-magaerna-ex', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /^magearna$/i.test(String(title || '').trim()) ? 'Magearna' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Magaerna ex offensive vapeur 75/114';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const labels = processor.currentKeywords.map((keyword) => keyword.label);
    assert.ok(labels.includes('Magearna ex'), 'typo name phrase should be normalized in chips');
    assert.ok(labels.includes('ex'));
    assert.ok(labels.includes('75/114'));
    assert.equal(processor.currentKeywords.find((keyword) => keyword.label === 'Magearna ex')?.selectedByDefault, true);
    assert.equal(messages[0].vintedPayload.name, 'Magearna');
    assert.equal(messages[0].vintedPayload.variation, 'ex');
    assert.equal(messages[0].vintedPayload.collectorNumber, '75/114');
    assert.equal(messages[0].vintedPayload.numericCollectorNumber, '75');
    assert.equal(messages[0].title, 'Magearna ex 75/114');
    assert.deepEqual(Array.from(messages[0].primaryClues), ['Magearna ex', 'ex']);
});

test('Vinted normalizes Magaeran ex typo variant to Magearna', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/76-magaeran-ex', hostname: 'www.vinted.it' },
            extractTitleInfo: () => ({ pokemonName: null }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Magaeran ex offensive vapeur 75/114';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    assert.ok(processor.currentKeywords.some((keyword) => keyword.label === 'Magearna ex' && keyword.selectedByDefault));
    assert.equal(messages[0].vintedPayload.name, 'Magearna');
    assert.equal(messages[0].vintedPayload.variation, 'ex');
    assert.equal(messages[0].vintedPayload.collectorNumber, '75/114');
    assert.equal(messages[0].title, 'Magearna ex 75/114');
});

test('Vinted Magnezone V keeps V variation distinct from ex', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/56-magnezone-v', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /magnezone/i.test(String(title || '')) ? 'Magnezone' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return {
                        success: true,
                        results: [
                            { blueprint_id: 'magnezone-v', name_en: 'Magnezone V', expansion_name_en: 'Lost Origin', collector_number: '056/196', search_score: 95 },
                        ],
                    };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Magnezone V 056/196';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );
    processor.currentButton = createButtonStub();
    processor.renderCandidatePreview = () => {};

    await processor.searchCardWithBackground(processor.currentTitle);
    await processor.openPokoinSidePanel();

    const searchMessage = messages[0];
    assert.deepEqual(Array.from(searchMessage.primaryClues), ['Magnezone V', 'V']);
    assert.equal(searchMessage.vintedPayload.name, 'Magnezone');
    assert.equal(searchMessage.vintedPayload.variation, 'V');
    assert.equal(searchMessage.vintedPayload.collectorNumber, '056/196');
    assert.equal(searchMessage.vintedPayload.numericCollectorNumber, '056');
    assert.equal(searchMessage.title, 'Magnezone V 056/196');
    assert.doesNotMatch(searchMessage.title, /\bex\b/i);
    assert.equal(messages.at(-1).vintedPayload.variation, 'V');
    assert.deepEqual(messages.at(-1).previewRows.map((row) => row.card_id), ['magnezone-v']);
});

test('Vinted Mega Latias ex keeps Mega and ex selected in payload', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/380-mega-latias-ex', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /latias/i.test(String(title || '')) ? 'Latias' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Carta Pokémon Mega Latias Ex di Megaevoluzione PSA 10';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const selectedLabels = processor.selectedKeywordLabels();
    const payload = messages[0].vintedPayload;
    assert.ok(selectedLabels.includes('Mega Latias ex'), 'attached Mega phrase should be selected');
    assert.ok(selectedLabels.includes('Mega'), 'leading Mega modifier should stay selected');
    assert.ok(selectedLabels.includes('ex'), 'explicit ex modifier should stay selected');
    assert.equal(selectedLabels.includes('Megaevoluzione'), false, 'localized noisy evolution word should not be selected');
    assert.equal(payload.name, 'Latias');
    assert.deepEqual(new Set(payload.variation.split(/\s+/).filter(Boolean)), new Set(['Mega', 'ex']));
    assert.deepEqual(new Set(payload.primaryClues), new Set(['Mega Latias ex', 'Mega', 'ex']));
    assert.equal(messages[0].title, 'Mega Latias ex');
    assert.doesNotMatch(messages[0].title, /Megaevoluzione|PSA/i);
});

test('Vinted Pikachu volo VMAX keeps noisy word out of structured payload', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/7-pikachu-volo-vmax', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /^pikachu$/i.test(String(title || '').trim()) ? 'Pikachu' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Pikachu volo Vmax 007/025';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const selectedLabels = processor.selectedKeywordLabels();
    const payload = messages[0].vintedPayload;
    assert.ok(selectedLabels.includes('Pikachu'), 'base Pokemon name should be selected');
    assert.ok(selectedLabels.includes('VMAX'), 'explicit title variation should be selected');
    assert.ok(selectedLabels.includes('007/025'), 'collector should be selected');
    assert.equal(selectedLabels.includes('Pikachu volo VMAX'), false);
    assert.equal(selectedLabels.includes('Pikachu volo'), false);
    assert.equal(payload.name, 'Pikachu');
    assert.equal(payload.variation, 'VMAX');
    assert.equal(payload.collectorNumber, '007/025');
    assert.equal(payload.numericCollectorNumber, '007');
    assert.deepEqual(new Set(payload.primaryClues), new Set(['Pikachu', 'VMAX']));
    assert.ok(/\bPikachu\b/.test(messages[0].title));
    assert.ok(/\b007\/025\b/.test(messages[0].title));
    assert.ok(/\bVMAX\b/.test(messages[0].title));
    assert.doesNotMatch(messages[0].title, /\bvolo\b/i);
});

test('background Vinted selected keys keep unselected title words out of search', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/marketplace-autocomplete')) {
                assert.doesNotMatch(body.search_term || '', /\bvolo\b/i);
                return { ok: true, json: async () => ({ rows: [] }) };
            }
            if (url.includes('/api/extension-card-search')) {
                assert.doesNotMatch(body.name || '', /\bvolo\b/i);
                assert.equal(body.name, 'Pikachu VMAX');
                assert.equal(body.collectorNumber, '007/025');
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: 'flying-pikachu-vmax', name: 'Flying Pikachu VMAX', expansionName: 'Celebrations', collectorNumber: '007/025', score: 99 },
                        ],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Pikachu VMAX 007/025',
                originalTitle: 'Pikachu volo Vmax 007/025',
                url: 'https://www.vinted.it/items/7-pikachu-volo-vmax',
                clues: ['Pikachu', 'VMAX', '007/025'],
                selectedClues: ['Pikachu', 'VMAX', '007/025'],
                primaryClues: ['Pikachu', 'VMAX'],
                vintedPayload: {
                    source: 'vinted',
                    listingKey: 'https://www.vinted.it/items/7-pikachu-volo-vmax',
                    originalTitle: 'Pikachu volo Vmax 007/025',
                    searchTitle: 'Pikachu VMAX 007/025',
                    name: 'Pikachu',
                    variation: 'VMAX',
                    collectorNumber: '007/025',
                    numericCollectorNumber: '007',
                    selectedClues: ['Pikachu', 'VMAX', '007/025'],
                    primaryClues: ['Pikachu', 'VMAX'],
                },
            },
            { tab: { id: 7, title: 'Pikachu volo Vmax 007/025', url: 'https://www.vinted.it/items/7-pikachu-volo-vmax' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results[0].blueprint_id, 'flying-pikachu-vmax');
    assert.ok(fetchBodies.length > 0);
    assert.ok(fetchBodies.every((entry) => !JSON.stringify(entry.body).match(/\bvolo\b/i)));
});

test('background autocomplete resolver canonicalizes misspelled selected name before exact retry', async () => {
    const fetchBodies = [];
    const { sendMessage } = loadBackgroundMessageHarness({
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/searchbar-token-predict')) {
                return { ok: true, json: async () => ({ ok: true, predictions: [] }) };
            }
            if (url.includes('/api/extension-card-search')) {
                if (body.name === 'Zecrom') {
                    return { ok: true, json: async () => ({ matches: [] }) };
                }
                assert.equal(body.name, 'Zekrom');
                assert.equal(body.collectorNumber, '050/99');
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: 'zekrom-050', name: 'Zekrom', expansionName: 'Next Destinies', collectorNumber: '050/99', score: 99 },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                if (body.result_limit === 20) {
                    assert.equal(body.search_term, 'Zecrom');
                    assert.equal(body.pool_limit, 1000);
                    assert.equal(body.search_language, 'en');
                    assert.ok(body.search_session_id);
                }
                return {
                    ok: true,
                    json: async () => ({
                        rows: [
                            { card_id: 'zekrom-name', name: 'Zekrom', canonical_name: 'Zekrom', search_rank: 100 },
                        ],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
    });

    const response = await sendMessage({
        action: 'searchCardForTitle',
        title: 'Zecrom 050/99',
        originalTitle: 'Zecrom holo50/99',
        url: 'https://www.vinted.it/items/501-zecrom-050-99',
        selectedClues: ['Zecrom', '050/99'],
        clues: ['Zecrom', '050/99'],
        primaryClues: ['Zecrom'],
        previewSignature: 'vinted|zecrom|050-99',
        selectionRevision: 1,
        vintedPayload: {
            source: 'vinted',
            listingKey: 'https://www.vinted.it/items/501-zecrom-050-99',
            originalTitle: 'Zecrom holo50/99',
            searchTitle: 'Zecrom 050/99',
            name: 'Zecrom',
            collectorNumber: '050/99',
            numericCollectorNumber: '050',
            selectedClues: ['Zecrom', '050/99'],
            primaryClues: ['Zecrom'],
        },
    }, { tab: { id: 501, title: 'Zecrom holo50/99', url: 'https://www.vinted.it/items/501-zecrom-050-99' } });

    assert.equal(response.success, true, JSON.stringify(response));
    assert.equal(response.results[0].blueprint_id, 'zekrom-050');
    const extensionNames = fetchBodies
        .filter((entry) => entry.url.includes('/api/extension-card-search'))
        .map((entry) => entry.body.name)
        .filter(Boolean);
    assert.deepEqual(extensionNames, ['Zecrom', 'Zekrom']);
});

test('background uses searchbar token prediction before heavy autocomplete name resolver', async () => {
    const fetchBodies = [];
    const { sendMessage } = loadBackgroundMessageHarness({
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/searchbar-token-predict')) {
                assert.equal(body.query, 'Mewt');
                assert.equal(body.search_language, 'en');
                return {
                    ok: true,
                    json: async () => ({
                        ok: true,
                        predictions: [{
                            display_token: 'Mewtwo',
                            normalized_token: 'mewtwo',
                            confidence: 94,
                            source_rank: 1,
                        }],
                    }),
                };
            }
            if (url.includes('/api/extension-card-search')) {
                if (body.name === 'Mewt') {
                    return { ok: true, json: async () => ({ matches: [] }) };
                }
                assert.equal(body.name, 'Mewtwo');
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            cardId: 'mewtwo-150',
                            name: 'Mewtwo',
                            expansionName: 'Base Set',
                            collectorNumber: '150',
                            score: 99,
                        }],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                throw new Error('token prediction should avoid heavy autocomplete resolver');
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
    });

    const response = await sendMessage({
        action: 'searchCardForTitle',
        title: 'Mewt 150',
        originalTitle: 'Mewt 150',
        url: 'https://www.vinted.it/items/150-mewt',
        selectedClues: ['Mewt', '150'],
        clues: ['Mewt', '150'],
        primaryClues: ['Mewt'],
        previewSignature: 'vinted|mewt|150',
        selectionRevision: 1,
        vintedPayload: {
            source: 'vinted',
            listingKey: 'https://www.vinted.it/items/150-mewt',
            originalTitle: 'Mewt 150',
            searchTitle: 'Mewt 150',
            name: 'Mewt',
            collectorNumber: '150',
            numericCollectorNumber: '150',
            selectedClues: ['Mewt', '150'],
            primaryClues: ['Mewt'],
        },
    }, { tab: { id: 150, title: 'Mewt 150', url: 'https://www.vinted.it/items/150-mewt' } });

    assert.equal(response.success, true, JSON.stringify(response));
    assert.equal(response.results[0].blueprint_id, 'mewtwo-150');
    assert.ok(fetchBodies.some((entry) => entry.url.includes('/api/searchbar-token-predict')));
    assert.equal(fetchBodies.some((entry) => entry.url.includes('/api/marketplace-autocomplete')), false);
});

test('background autocomplete resolver skips standalone feature and context clues', async () => {
    const fetchBodies = [];
    const { sendMessage } = loadBackgroundMessageHarness({
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            if (url.includes('/api/searchbar-token-predict')) {
                return { ok: true, json: async () => ({ ok: true, predictions: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                return { ok: true, json: async () => ({ matches: [] }) };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                assert.doesNotMatch(body.search_term || '', /^(?:holo|delta|illustration|liv\.?\s*53|liv 53|Evolutions)$/i);
                return { ok: true, json: async () => ({ rows: [] }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
    });

    await sendMessage({
        action: 'searchCardForTitle',
        title: 'holo delta illustration Lv. 53 Evolutions 25/108',
        originalTitle: 'holo delta illustration liv 53 Evoluzioni',
        url: 'https://www.vinted.it/items/502-context-only',
        selectedClues: ['holo', 'delta', 'illustration', 'liv 53', 'Evolutions', '25/108'],
        clues: ['holo', 'delta', 'illustration', 'liv 53', 'Evolutions', '25/108'],
        primaryClues: [],
        previewSignature: 'vinted|context-only',
        selectionRevision: 1,
        vintedPayload: {
            source: 'vinted',
            listingKey: 'https://www.vinted.it/items/502-context-only',
            originalTitle: 'holo delta illustration liv 53 Evoluzioni',
            searchTitle: 'holo delta illustration Lv. 53 Evolutions 25/108',
            name: '',
            variation: '',
            collectorNumber: '25/108',
            numericCollectorNumber: '25',
            selectedClues: ['holo', 'delta', 'illustration', 'liv 53', 'Evolutions', '25/108'],
            primaryClues: [],
            features: ['holo', 'delta', 'illustration'],
        },
    }, { tab: { id: 502, title: 'holo delta illustration liv 53 Evoluzioni', url: 'https://www.vinted.it/items/502-context-only' } });

    const resolverQueries = fetchBodies
        .filter((entry) => entry.url.includes('/api/marketplace-autocomplete'))
        .map((entry) => entry.body.search_term);
    assert.equal(resolverQueries.some((query) => /^(?:holo|delta|illustration|liv|Evolutions)$/i.test(query)), false);
});

test('background autocomplete resolver cache reuses same selected clue signature', async () => {
    const fetchBodies = [];
    const { sendMessage } = loadBackgroundMessageHarness({
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                return { ok: true, json: async () => ({ matches: [] }) };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return {
                    ok: true,
                    json: async () => ({
                        rows: [
                            { card_id: 'sprigatito-name', name: 'Sprigatito', canonical_name: 'Sprigatito', search_rank: 100 },
                        ],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
    });
    const request = {
        action: 'searchCardForTitle',
        title: 'Sprigatito',
        originalTitle: 'Sprigatito illustration',
        url: 'https://www.vinted.it/items/503-sprigatito',
        selectedClues: ['Sprigatito'],
        clues: ['Sprigatito'],
        primaryClues: ['Sprigatito'],
        previewSignature: 'vinted|sprigatito|a',
        selectionRevision: 1,
        vintedPayload: {
            source: 'vinted',
            listingKey: 'https://www.vinted.it/items/503-sprigatito',
            originalTitle: 'Sprigatito illustration',
            searchTitle: 'Sprigatito',
            name: 'Sprigatito',
            selectedClues: ['Sprigatito'],
            primaryClues: ['Sprigatito'],
        },
    };
    const sender = { tab: { id: 503, title: 'Sprigatito illustration', url: request.url } };

    await sendMessage(request, sender);
    const autocompleteAfterFirst = fetchBodies.filter((entry) =>
        entry.url.includes('/api/marketplace-autocomplete') && entry.body.result_limit === 20
    ).length;
    await sendMessage({ ...request, forceRefresh: true }, sender);
    const autocompleteAfterSecond = fetchBodies.filter((entry) =>
        entry.url.includes('/api/marketplace-autocomplete') && entry.body.result_limit === 20
    ).length;

    assert.equal(autocompleteAfterFirst, 1);
    assert.equal(autocompleteAfterSecond, 1, 'same selected clue signature should reuse resolver cache even on forced search');
});

test('background autocomplete resolver changes query for changed manual clue signature', async () => {
    const fetchBodies = [];
    const { sendMessage } = loadBackgroundMessageHarness({
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                return { ok: true, json: async () => ({ matches: [] }) };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                const rows = body.search_term === 'Mimikyu'
                    ? []
                    : [{ card_id: `${body.search_term}-name`, name: body.search_term, canonical_name: body.search_term, search_rank: 100 }];
                return {
                    ok: true,
                    json: async () => ({
                        rows,
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
    });
    const basePayload = {
        source: 'vinted',
        listingKey: 'https://www.vinted.it/items/504-manual',
        originalTitle: 'manual name clue',
        searchTitle: 'Mimikyu',
        name: 'Mimikyu',
        selectedClues: ['Mimikyu'],
        primaryClues: ['Mimikyu'],
    };
    const baseRequest = {
        action: 'searchCardForTitle',
        title: 'Mimikyu',
        originalTitle: 'manual name clue',
        url: basePayload.listingKey,
        selectedClues: ['Mimikyu'],
        clues: ['Mimikyu'],
        primaryClues: ['Mimikyu'],
        previewSignature: 'vinted|manual|mimikyu',
        selectionRevision: 1,
        vintedPayload: basePayload,
    };
    const sender = { tab: { id: 504, title: 'manual name clue', url: basePayload.listingKey } };

    await sendMessage(baseRequest, sender);
    await sendMessage({
        ...baseRequest,
        title: 'Mimikyu Mabosstiff',
        selectedClues: ['Mimikyu', 'Mabosstiff'],
        clues: ['Mimikyu', 'Mabosstiff'],
        primaryClues: ['Mimikyu', 'Mabosstiff'],
        previewSignature: 'vinted|manual|mimikyu|mabosstiff',
        selectionRevision: 2,
        vintedPayload: {
            ...basePayload,
            searchTitle: 'Mimikyu Mabosstiff',
            selectedClues: ['Mimikyu', 'Mabosstiff'],
            primaryClues: ['Mimikyu', 'Mabosstiff'],
        },
    }, sender);

    const resolverQueries = fetchBodies
        .filter((entry) => entry.url.includes('/api/marketplace-autocomplete') && entry.body.result_limit === 20)
        .map((entry) => entry.body.search_term);
    assert.ok(resolverQueries.includes('Mimikyu'), JSON.stringify(resolverQueries));
    assert.ok(resolverQueries.includes('Mabosstiff'), JSON.stringify(resolverQueries));
});

test('background autocomplete resolver keeps trainer composite name over shorter species', async () => {
    const fetchBodies = [];
    const { sendMessage } = loadBackgroundMessageHarness({
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                if (body.name === "Arven's Mabosstiff ex") {
                    return {
                        ok: true,
                        json: async () => ({
                            matches: [
                                { cardId: 'arven-mabosstiff-ex', name: "Arven's Mabosstiff ex", expansionName: 'Scarlet Violet Promos', collectorNumber: '123', score: 99 },
                            ],
                        }),
                    };
                }
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: 'plain-mabosstiff', name: 'Mabosstiff ex', expansionName: 'Scarlet Violet', collectorNumber: '099', score: 100 },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                assert.match(body.search_term, /Arven's Mabosstiff ex/i);
                return {
                    ok: true,
                    json: async () => ({
                        rows: [
                            { card_id: 'plain-mabosstiff', name: 'Mabosstiff ex', canonical_name: 'Mabosstiff ex', search_rank: 100 },
                            { card_id: 'arven-mabosstiff-ex', name: "Arven's Mabosstiff ex", canonical_name: "Arven's Mabosstiff ex", search_rank: 90 },
                        ],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
    });

    const response = await sendMessage({
        action: 'searchCardForTitle',
        title: "Arven's Mabosstiff ex",
        originalTitle: "Arven's Mabosstiff ex",
        url: 'https://www.vinted.it/items/505-arvens-mabosstiff',
        selectedClues: ["Arven's Mabosstiff ex"],
        clues: ["Arven's Mabosstiff ex"],
        primaryClues: ["Arven's Mabosstiff ex"],
        previewSignature: 'vinted|arvens-mabosstiff',
        selectionRevision: 1,
        vintedPayload: {
            source: 'vinted',
            listingKey: 'https://www.vinted.it/items/505-arvens-mabosstiff',
            originalTitle: "Arven's Mabosstiff ex",
            searchTitle: "Arven's Mabosstiff ex",
            name: "Arven's Mabosstiff ex",
            variation: 'ex',
            selectedClues: ["Arven's Mabosstiff ex"],
            primaryClues: ["Arven's Mabosstiff ex"],
        },
    }, { tab: { id: 505, title: "Arven's Mabosstiff ex", url: 'https://www.vinted.it/items/505-arvens-mabosstiff' } });

    assert.equal(response.success, true, JSON.stringify(response));
    assert.equal(response.results[0].blueprint_id, 'arven-mabosstiff-ex');
    const exactNames = fetchBodies
        .filter((entry) => entry.url.includes('/api/extension-card-search'))
        .map((entry) => entry.body.name);
    assert.ok(exactNames.every((name) => name === "Arven's Mabosstiff ex"), JSON.stringify(exactNames));
});

test('background resolver promotes Holon Transceiver over suffix token and caches API calls', async () => {
    const fetchBodies = [];
    const { sendMessage } = loadBackgroundMessageHarness({
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/searchbar-token-predict')) {
                assert.notEqual(body.query, 'Transceiver', 'suffix token should not be resolved before full phrase');
                return { ok: true, json: async () => ({ ok: true, predictions: [] }) };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                assert.notEqual(body.search_term, 'Transceiver', 'suffix token should not be autocompleted when full phrase is present');
                return {
                    ok: true,
                    json: async () => ({
                        rows: [
                            { card_id: 'plain-transceiver', name: 'Transceiver', canonical_name: 'Transceiver', search_rank: 100 },
                            { card_id: 'holon-transceiver', name: 'Holon Transceiver', canonical_name: 'Holon Transceiver', search_rank: 90 },
                        ],
                    }),
                };
            }
            if (url.includes('/api/extension-card-search')) {
                assert.equal(body.name.replace(/\s+Delta Species$/i, ''), 'Holon Transceiver');
                assert.equal(body.collectorNumber, '98');
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: 'holon-transceiver-98', name: 'Holon Transceiver', expansionName: 'EX Delta Species', collectorNumber: '98/113', score: 99 },
                        ],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
    });
    const request = {
        action: 'searchCardForTitle',
        title: 'Transceiver Delta Species 98',
        originalTitle: 'Delta Species: Holon Transceiver [98]',
        url: 'https://www.vinted.it/items/98-holon-transceiver',
        selectedClues: ['Transceiver', 'Holon Transceiver', 'Delta Species', '98'],
        clues: ['Transceiver', 'Holon Transceiver', 'Delta Species', '98'],
        primaryClues: ['Transceiver', 'Holon Transceiver'],
        previewSignature: 'vinted|holon-transceiver|98',
        selectionRevision: 1,
        vintedPayload: {
            source: 'vinted',
            listingKey: 'https://www.vinted.it/items/98-holon-transceiver',
            originalTitle: 'Delta Species: Holon Transceiver [98]',
            searchTitle: 'Transceiver Holon Transceiver Delta Species 98',
            name: 'Transceiver',
            variation: '',
            collectorNumber: '98',
            numericCollectorNumber: '98',
            selectedClues: ['Transceiver', 'Holon Transceiver', 'Delta Species', '98'],
            primaryClues: ['Transceiver', 'Holon Transceiver'],
        },
    };
    const sender = { tab: { id: 598, title: request.originalTitle, url: request.url } };

    const response = await sendMessage(request, sender);
    assert.equal(response.success, true, JSON.stringify(response));
    assert.equal(response.results[0].blueprint_id, 'holon-transceiver-98');
    const tokenCallsAfterFirst = fetchBodies.filter((entry) => entry.url.includes('/api/searchbar-token-predict')).length;
    const autocompleteCallsAfterFirst = fetchBodies.filter((entry) => entry.url.includes('/api/marketplace-autocomplete')).length;

    const cachedResponse = await sendMessage({ ...request, forceRefresh: true }, sender);
    assert.equal(cachedResponse.success, true, JSON.stringify(cachedResponse));
    const tokenCallsAfterSecond = fetchBodies.filter((entry) => entry.url.includes('/api/searchbar-token-predict')).length;
    const autocompleteCallsAfterSecond = fetchBodies.filter((entry) => entry.url.includes('/api/marketplace-autocomplete')).length;

    assert.equal(tokenCallsAfterFirst, 1, 'full phrase should use fast token prediction once');
    assert.equal(autocompleteCallsAfterFirst, 1, 'full phrase should use autocomplete once after empty prediction');
    assert.equal(tokenCallsAfterSecond, tokenCallsAfterFirst, 'token prediction cache should prevent repeat calls');
    assert.equal(autocompleteCallsAfterSecond, autocompleteCallsAfterFirst, 'autocomplete cache should prevent repeat calls');
    assert.deepEqual(
        fetchBodies.filter((entry) => entry.url.includes('/api/extension-card-search')).map((entry) => entry.body.name),
        ['Holon Transceiver', 'Holon Transceiver']
    );
});

test('background Vinted recent search cache reuses same selected payload', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: 'cleffa-20', name: 'Cleffa', expansionName: 'Neo Genesis', collectorNumber: '20/111', score: 99 },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return { ok: true, json: async () => ({ rows: [] }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const request = {
        action: 'searchCardForTitle',
        title: 'Cleffa 20/111',
        originalTitle: 'Cleffa 20/111',
        url: 'https://www.vinted.it/items/20-cleffa',
        selectedClues: ['Cleffa', '20/111'],
        clues: ['Cleffa', '20/111'],
        primaryClues: ['Cleffa'],
        previewSignature: 'vinted|cleffa|20-111',
        selectionRevision: 1,
        vintedPayload: {
            source: 'vinted',
            listingKey: 'https://www.vinted.it/items/20-cleffa',
            originalTitle: 'Cleffa 20/111',
            searchTitle: 'Cleffa 20/111',
            name: 'Cleffa',
            collectorNumber: '20/111',
            numericCollectorNumber: '20',
            selectedClues: ['Cleffa', '20/111'],
            primaryClues: ['Cleffa'],
        },
    };
    const sender = { tab: { id: 20, title: 'Cleffa 20/111', url: request.url } };

    const first = await new Promise((resolve) => messageListener(request, sender, resolve));
    const fetchesAfterFirst = fetchBodies.length;
    const second = await new Promise((resolve) => messageListener({ ...request }, sender, resolve));

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.deepEqual([...second.results.map((row) => row.blueprint_id)], ['cleffa-20']);
    assert.equal(fetchBodies.length, fetchesAfterFirst, 'same Vinted payload should reuse recent search cache');
});

test('background Vinted recent search cache changes key for clue or URL changes', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: `${body.name || 'card'}-${body.collectorNumber || fetchBodies.length}`, name: body.name || 'Card', collectorNumber: body.collectorNumber || '', score: 99 },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return { ok: true, json: async () => ({ rows: [] }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const sender = { tab: { id: 21, title: 'Cleffa 20/111', url: 'https://www.vinted.it/items/21-cleffa' } };
    const basePayload = {
        source: 'vinted',
        listingKey: sender.tab.url,
        originalTitle: 'Cleffa 20/111',
        searchTitle: 'Cleffa 20/111',
        name: 'Cleffa',
        collectorNumber: '20/111',
        numericCollectorNumber: '20',
        selectedClues: ['Cleffa', '20/111'],
        primaryClues: ['Cleffa'],
    };
    const baseRequest = {
        action: 'searchCardForTitle',
        title: 'Cleffa 20/111',
        originalTitle: 'Cleffa 20/111',
        url: sender.tab.url,
        selectedClues: ['Cleffa', '20/111'],
        clues: ['Cleffa', '20/111'],
        primaryClues: ['Cleffa'],
        previewSignature: 'vinted|cleffa|20-111',
        selectionRevision: 1,
        vintedPayload: basePayload,
    };

    await new Promise((resolve) => messageListener(baseRequest, sender, resolve));
    const afterBase = fetchBodies.length;
    await new Promise((resolve) => messageListener({
        ...baseRequest,
        title: 'Cleffa promo 20/111',
        selectedClues: ['Cleffa', 'promo', '20/111'],
        clues: ['Cleffa', 'promo', '20/111'],
        previewSignature: 'vinted|cleffa|promo|20-111',
        selectionRevision: 2,
        vintedPayload: {
            ...basePayload,
            searchTitle: 'Cleffa promo 20/111',
            selectedClues: ['Cleffa', 'promo', '20/111'],
        },
    }, sender, resolve));
    const afterClueChange = fetchBodies.length;
    await new Promise((resolve) => messageListener({
        ...baseRequest,
        url: 'https://www.vinted.it/items/22-cleffa',
        vintedPayload: {
            ...basePayload,
            listingKey: 'https://www.vinted.it/items/22-cleffa',
        },
    }, { tab: { ...sender.tab, url: 'https://www.vinted.it/items/22-cleffa' } }, resolve));

    assert.ok(afterBase > 0);
    assert.ok(afterClueChange > afterBase, 'changed selected clue should miss recent cache');
    assert.ok(fetchBodies.length > afterClueChange, 'changed listing URL should miss recent cache');
});

test('background Vinted cache changes key for preview signature revision and force refresh', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                const index = fetchBodies.length;
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: `mega-charizard-${index}`, name: 'Mega Charizard', collectorNumber: String(index), score: 99 },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return { ok: true, json: async () => ({ rows: [] }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const sender = { tab: { id: 37, title: 'Mega Charizard ex', url: 'https://www.vinted.it/items/37-mega-charizard' } };
    const basePayload = {
        source: 'vinted',
        listingKey: sender.tab.url,
        originalTitle: 'Mega Charizard ex',
        searchTitle: 'Mega Charizard',
        name: 'Charizard',
        variation: 'Mega',
        selectedClues: ['Mega Charizard'],
        primaryClues: ['Mega Charizard'],
    };
    const request = {
        action: 'searchCardForTitle',
        title: 'Mega Charizard',
        originalTitle: 'Mega Charizard ex',
        url: sender.tab.url,
        selectedClues: ['Mega Charizard'],
        clues: ['Mega Charizard'],
        primaryClues: ['Mega Charizard'],
        previewSignature: 'vinted|mega-charizard|a',
        selectionRevision: 1,
        vintedPayload: basePayload,
    };

    await new Promise((resolve) => messageListener(request, sender, resolve));
    const afterFirst = fetchBodies.length;
    await new Promise((resolve) => messageListener({ ...request }, sender, resolve));
    const afterCached = fetchBodies.length;
    await new Promise((resolve) => messageListener({
        ...request,
        previewSignature: 'vinted|mega-charizard|b',
        selectionRevision: 2,
        vintedPayload: {
            ...basePayload,
            selectedClues: ['Mega Charizard', 'Mysterious Treasures'],
        },
    }, sender, resolve));
    const afterSignatureChange = fetchBodies.length;
    await new Promise((resolve) => messageListener({ ...request, forceRefresh: true }, sender, resolve));

    assert.equal(afterCached, afterFirst, 'same signature should reuse recent cache');
    assert.ok(afterSignatureChange > afterCached, 'changed signature/revision should miss recent cache');
    assert.ok(fetchBodies.length > afterSignatureChange, 'force refresh should bypass recent cache');
});

test('background broad Mega Charizard selected-chip search fills beyond exact three rows', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const extensionRows = [
        { cardId: 'mega-charizard-1', name: 'Mega Charizard EX', expansionName: 'Flashfire', collectorNumber: '69/106', score: 99 },
        { cardId: 'mega-charizard-2', name: 'Mega Charizard Y EX', expansionName: 'Evolutions', collectorNumber: '13/108', score: 98 },
        { cardId: 'mega-charizard-3', name: 'Mega Charizard X EX', expansionName: 'Flashfire', collectorNumber: '108/106', score: 97 },
    ];
    const fallbackRows = [
        { card_id: 'mega-charizard-1', name: 'Mega Charizard EX', set_name: 'Flashfire', card_number: '69/106', search_rank: 99 },
        { card_id: 'mega-charizard-2', name: 'Mega Charizard Y EX', set_name: 'Evolutions', card_number: '13/108', search_rank: 98 },
        { card_id: 'mega-charizard-3', name: 'Mega Charizard X EX', set_name: 'Flashfire', card_number: '108/106', search_rank: 97 },
        { card_id: 'mega-charizard-4', name: 'Mega Charizard EX', set_name: 'Promo', card_number: 'XY17', search_rank: 96 },
        { card_id: 'mega-charizard-5', name: 'Mega Charizard', set_name: 'Generations', card_number: '12/83', search_rank: 95 },
        { card_id: 'charizard-ex-generic', name: 'Charizard ex', set_name: 'Scarlet Violet', card_number: '006/165', search_rank: 500 },
    ];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                assert.equal(body.name, 'Mega Charizard');
                assert.equal(body.variation, 'Mega');
                return { ok: true, json: async () => ({ matches: extensionRows }) };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                assert.match(body.search_term, /Mega Charizard/i);
                return { ok: true, json: async () => ({ rows: fallbackRows }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const request = {
        action: 'searchCardForTitle',
        title: 'Mega Charizard',
        originalTitle: 'Mega Charizard ex',
        url: 'https://www.vinted.it/items/38-mega-charizard',
        selectedClues: ['Mega Charizard'],
        clues: ['Mega Charizard'],
        primaryClues: ['Mega Charizard'],
        previewSignature: 'vinted|mega-charizard|broad',
        selectionRevision: 1,
        vintedPayload: {
            source: 'vinted',
            listingKey: 'https://www.vinted.it/items/38-mega-charizard',
            originalTitle: 'Mega Charizard ex',
            searchTitle: 'Mega Charizard',
            name: 'Charizard',
            variation: 'Mega',
            selectedClues: ['Mega Charizard'],
            primaryClues: ['Mega Charizard'],
        },
    };
    const response = await new Promise((resolve) => messageListener(
        request,
        { tab: { id: 38, title: 'Mega Charizard ex', url: request.url } },
        resolve
    ));

    assert.equal(response.success, true, JSON.stringify(response));
    assert.ok(response.results.length > 3, JSON.stringify({ response, fetchBodies }));
    assert.deepEqual(Array.from(response.results.slice(0, 5).map((row) => row.blueprint_id)), [
        'mega-charizard-1',
        'mega-charizard-2',
        'mega-charizard-3',
        'mega-charizard-4',
        'mega-charizard-5',
    ]);
    assert.ok(fetchBodies.some((entry) => entry.url.includes('/api/marketplace-autocomplete')), 'broad Mega search should run fallback fill');
});

test('background recent search cache evicts entries beyond last 20', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: `${body.name}-${body.collectorNumber}`, name: body.name, collectorNumber: body.collectorNumber, score: 99 },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return { ok: true, json: async () => ({ rows: [] }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const makeRequest = (index) => {
        const name = `Cleffa${index}`;
        const collectorNumber = `${index}/111`;
        const url = `https://www.vinted.it/items/${index}-cleffa`;
        return {
            action: 'searchCardForTitle',
            title: `${name} ${collectorNumber}`,
            originalTitle: `${name} ${collectorNumber}`,
            url,
            selectedClues: [name, collectorNumber],
            clues: [name, collectorNumber],
            primaryClues: [name],
            previewSignature: `vinted|${name}|${collectorNumber}`,
            selectionRevision: 1,
            vintedPayload: {
                source: 'vinted',
                listingKey: url,
                originalTitle: `${name} ${collectorNumber}`,
                searchTitle: `${name} ${collectorNumber}`,
                name,
                collectorNumber,
                numericCollectorNumber: String(index),
                selectedClues: [name, collectorNumber],
                primaryClues: [name],
            },
        };
    };

    for (let index = 1; index <= 21; index += 1) {
        const request = makeRequest(index);
        await new Promise((resolve) => messageListener(
            request,
            { tab: { id: index, title: request.title, url: request.url } },
            resolve
        ));
    }
    const fetchesAfterWarmup = fetchBodies.length;

    const newestRequest = makeRequest(21);
    await new Promise((resolve) => messageListener(
        newestRequest,
        { tab: { id: 21, title: newestRequest.title, url: newestRequest.url } },
        resolve
    ));
    assert.equal(fetchBodies.length, fetchesAfterWarmup, 'newest cached entry should remain in the last 20');

    const oldestRequest = makeRequest(1);
    await new Promise((resolve) => messageListener(
        oldestRequest,
        { tab: { id: 1, title: oldestRequest.title, url: oldestRequest.url } },
        resolve
    ));
    assert.ok(fetchBodies.length > fetchesAfterWarmup, 'oldest entry should be evicted after 20 newer searches');
});

test('background Vinted Mega Latias ex rejects non-Mega Latias rows', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                assert.equal(body.name, 'Mega Latias ex');
                assert.equal(body.variation, 'Mega ex');
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: 'alto-mares-latias', name: "Alto Mare's Latias", expansionName: 'Pokémon Movie VS Pack', collectorNumber: '011/018', score: 100 },
                            { cardId: 'latias', name: 'Latias', expansionName: 'Generic Set', collectorNumber: '10', score: 98 },
                            { cardId: 'mega-latias-ex', name: 'Mega Latias EX', expansionName: 'XY Promos', collectorNumber: 'XY78', score: 75 },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                assert.doesNotMatch(body.search_term || '', /Megaevoluzione|PSA/i);
                return { ok: true, json: async () => ({ rows: [] }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Mega Latias ex',
                originalTitle: 'Carta Pokémon Mega Latias Ex di Megaevoluzione PSA 10',
                url: 'https://www.vinted.it/items/380-mega-latias-ex',
                clues: ['Mega Latias ex', 'Mega', 'ex'],
                selectedClues: ['Mega Latias ex', 'Mega', 'ex'],
                primaryClues: ['Mega Latias ex', 'Mega', 'ex'],
                vintedPayload: {
                    source: 'vinted',
                    listingKey: 'https://www.vinted.it/items/380-mega-latias-ex',
                    originalTitle: 'Carta Pokémon Mega Latias Ex di Megaevoluzione PSA 10',
                    searchTitle: 'Mega Latias ex',
                    name: 'Latias',
                    variation: 'Mega ex',
                    selectedClues: ['Mega Latias ex', 'Mega', 'ex'],
                    primaryClues: ['Mega Latias ex', 'Mega', 'ex'],
                },
            },
            { tab: { id: 380, title: 'Carta Pokémon Mega Latias Ex di Megaevoluzione PSA 10', url: 'https://www.vinted.it/items/380-mega-latias-ex' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.deepEqual(Array.from(response.results.map((row) => row.blueprint_id)), ['mega-latias-ex']);
    assert.ok(fetchBodies.some((entry) => entry.url.includes('/api/extension-card-search')));
});

test('Vinted Magneton PROMO 159 keeps promo collector and preview rows in side panel payload', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/159-magneton-promo', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /magneton/i.test(String(title || '')) ? 'Magneton' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return {
                        success: true,
                        results: [
                            { blueprint_id: 'magneton-pc-159', name_en: 'Magneton', expansion_name_en: 'Pokemon Center', collector_number: '159', search_score: 99 },
                            { blueprint_id: 'magneton-svp-159', name_en: 'Magneton', expansion_name_en: 'SV Black Star Promos', collector_number: 'SVP 159', search_score: 95 },
                        ],
                    };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Magneton PROMO 159 Ita';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);
    await processor.openPokoinSidePanel();

    const selectedLabels = processor.selectedKeywordLabels();
    const searchMessage = messages[0];
    const openMessage = messages.at(-1);
    assert.ok(selectedLabels.includes('Magneton'));
    assert.ok(selectedLabels.includes('PROMO 159'));
    assert.ok(selectedLabels.includes('illustration'));
    assert.equal(searchMessage.vintedPayload.collectorNumber, 'PROMO 159');
    assert.equal(searchMessage.vintedPayload.numericCollectorNumber, '159');
    assert.match(searchMessage.title, /PROMO 159/);
    assert.equal(openMessage.action, 'openSidePanelForCurrentTab');
    assert.equal(openMessage.vintedPayload.collectorNumber, 'PROMO 159');
    assert.deepEqual(openMessage.previewRows.map((row) => row.card_id), ['magneton-pc-159', 'magneton-svp-159']);
    assert.deepEqual(openMessage.previewRows.map((row) => row.card_number), ['159', 'SVP 159']);
});

test('Vinted preserves trainer composite clue in background payload', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/35-arven-mabosstiff', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /mabosstiff/i.test(String(title || '')) ? 'Mabosstiff' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Pokemon card Mabosstiff ex';
    processor.currentKeywords = processor.extractVintedKeywords(
        processor.currentTitle,
        'Arven\'s Mabosstiff ex 484'
    );
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    assert.ok(processor.currentKeywords.some((keyword) => keyword.value === 'Arven\'s Mabosstiff ex'));
    assert.ok(messages[0].clues.some((clue) => clue === 'Arven\'s Mabosstiff ex'));
    assert.ok(messages[0].primaryClues.some((clue) => clue === 'Arven\'s Mabosstiff ex'));
    assert.equal(messages[0].title, 'Arven\'s Mabosstiff ex');
});

test('Vinted detached description variation is manual by default', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/34-regice', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /^regice$/i.test(String(title || '').trim()) ? 'Regice' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Pokemon Regice';
    processor.currentKeywords = processor.extractVintedKeywords(
        processor.currentTitle,
        'Carta vintage. Versione ex nella descrizione.'
    );
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    assert.deepEqual(Array.from(processor.selectedKeywordLabels()), ['Regice']);
    assert.deepEqual(Array.from(messages[0].clues), ['Regice']);
    assert.deepEqual(Array.from(messages[0].primaryClues), ['Regice']);
    assert.equal(messages[0].title, 'Regice');
});

test('Vinted multi-word Pokemon phrase keeps attached GX selected', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/35-gengar-mimikyu-gx', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /gengar\s+mimikyu/i.test(String(title || '')) ? 'Gengar Mimikyu' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Gengar & Mimikyu GX Set Ex vintage';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    assert.deepEqual(Array.from(processor.selectedKeywordLabels()), ['Gengar Mimikyu GX', 'GX']);
    assert.deepEqual(Array.from(messages[0].primaryClues), ['Gengar Mimikyu GX', 'GX']);
    assert.equal(messages[0].title, 'Gengar Mimikyu GX');
});

test('Vinted tag-team connector title defaults composite chip and keeps individual tokens', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/36-espeon-deoxys', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => {
                const value = String(title || '').toLowerCase();
                if (/espeon.*deoxys/.test(value)) {
                    return { pokemonName: 'Espeon & Deoxys' };
                }
                if (/^espeon$/.test(value)) {
                    return { pokemonName: 'Espeon' };
                }
                if (/^deoxys$/.test(value)) {
                    return { pokemonName: 'Deoxys' };
                }
                return { pokemonName: null };
            },
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Espeon e deoxys ex';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const labels = processor.currentKeywords.map((keyword) => keyword.label);
    const selectedLabels = processor.selectedKeywordLabels();
    assert.ok(labels.includes('Espeon & Deoxys ex') || labels.includes('Espeon Deoxys ex'), 'composite tag-team chip should render');
    assert.ok(labels.includes('Espeon'), 'individual title token should remain clickable');
    assert.ok(labels.includes('deoxys') || labels.includes('Deoxys'), 'individual title token should remain clickable');
    assert.ok(selectedLabels.some((label) => /Espeon.*Deoxys.*ex/i.test(label)), 'composite should default selected');
    assert.equal(messages[0].vintedPayload.name, 'Espeon & Deoxys ex');
    assert.deepEqual(Array.from(messages[0].primaryClues), ['Espeon & Deoxys ex', 'ex']);
    assert.equal(messages[0].title, 'Espeon & Deoxys ex');
});

test('Vinted Mega Charizard X ex keeps Mega form selected in payload', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/37-mega-charizard-x', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /charizard/i.test(String(title || '')) ? 'Charizard' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Mega charizard X ex 13/94';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const labels = processor.currentKeywords.map((keyword) => keyword.label);
    const selectedLabels = processor.selectedKeywordLabels();
    assert.ok(labels.includes('X'), 'Mega form X should render as a chip');
    assert.ok(selectedLabels.includes('Mega'), 'Mega modifier should default selected');
    assert.ok(selectedLabels.includes('X'), 'Mega form X should default selected');
    assert.ok(selectedLabels.includes('ex'), 'ex variation should default selected');
    assert.ok(selectedLabels.includes('13/94'), 'collector should stay selected');
    assert.match(messages[0].title, /Mega/);
    assert.match(messages[0].title, /\bX\b/);
    assert.match(messages[0].title, /\bex\b/);
    assert.equal(messages[0].vintedPayload.variation, 'Mega ex X');
    assert.equal(messages[0].vintedPayload.collectorNumber, '13/94');
});

test('Vinted Mega Charizard chip alone keeps Mega identity without X or ex requirements', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/37-mega-charizard-x', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /charizard/i.test(String(title || '')) ? 'Charizard' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Mega charizard X ex 13/94';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    const megaCharizard = processor.currentKeywords.find((keyword) => keyword.compact === 'megacharizard');
    assert.ok(megaCharizard, 'Mega Charizard chip should render');
    processor.selectedKeywordValues = new Set([megaCharizard.compact]);

    await processor.searchCardWithBackground(processor.currentTitle);

    const selectedLabels = processor.selectedKeywordLabels();
    const payload = messages[0].vintedPayload;
    assert.deepEqual(Array.from(selectedLabels, (label) => label.toLowerCase()), ['mega charizard']);
    assert.equal(selectedLabels.includes('X'), false, 'X should not be selected');
    assert.equal(selectedLabels.includes('ex'), false, 'ex should not be selected');
    assert.equal(payload.name, 'Charizard');
    assert.equal(payload.variation, 'Mega');
    assert.deepEqual(Array.from(payload.primaryClues).map((label) => label.toLowerCase()), ['mega charizard']);
    assert.deepEqual(Array.from(payload.selectedClues).map((label) => label.toLowerCase()), ['mega charizard']);
    assert.equal(messages[0].title.toLowerCase(), 'mega charizard');
});

test('Vinted Feraligatr liv.53 title carries level and Mysterious Treasures evidence', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/39-feraligatr-liv-53', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /feraligatr/i.test(String(title || '')) ? 'Feraligatr' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Feraligatr liv.53 Tesori Misteriosi';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const selectedLabels = processor.selectedKeywordLabels();
    const payload = messages[0].vintedPayload;
    assert.ok(selectedLabels.includes('Feraligatr'));
    assert.ok(selectedLabels.includes('Lv 53'));
    assert.ok(selectedLabels.includes('Mysterious Treasures'));
    assert.equal(payload.name, 'Feraligatr');
    assert.equal(payload.levelNumber, '53');
    assert.equal(payload.expansion, 'Mysterious Treasures');
    assert.match(messages[0].title, /Lv\.?\s*53/);
});

test('Vinted Jolteon specie delta payload includes delta form and collector evidence', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/40-jolteon-delta', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /jolteon/i.test(String(title || '')) ? 'Jolteon' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Jolteon specie delta 7/113';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const selectedLabels = processor.selectedKeywordLabels();
    const payload = messages[0].vintedPayload;
    assert.ok(selectedLabels.includes('Jolteon Delta Species'));
    assert.ok(selectedLabels.includes('7/113'));
    assert.equal(payload.name, 'Jolteon');
    assert.equal(payload.variation, 'Delta Species');
    assert.equal(payload.collectorNumber, '7/113');
    assert.match(messages[0].title, /Delta Species/);
});

test('Vinted Team Rocket owner title defaults composite Mimikyu payload', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/38-mimikyu-team-rocket', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /mimikyu/i.test(String(title || '')) ? 'Mimikyu' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Mimikyu del Team Rocket Full Art pokemon';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const labels = processor.currentKeywords.map((keyword) => keyword.label);
    const selectedLabels = processor.selectedKeywordLabels();
    assert.ok(labels.includes("Team Rocket's Mimikyu"), 'owner/team composite chip should render');
    assert.ok(labels.includes('Team Rocket'), 'Team Rocket expansion/context chip should remain visible');
    assert.ok(labels.includes('Mimikyu'), 'individual species chip should remain clickable');
    assert.ok(selectedLabels.includes("Team Rocket's Mimikyu"), 'owner/team composite should default selected');
    assert.equal(selectedLabels.includes('Mimikyu'), false, 'generic species should be shadowed by owner/team composite');
    assert.equal(messages[0].vintedPayload.name, "Team Rocket's Mimikyu");
    assert.equal(messages[0].vintedPayload.rarity, 'illustration');
    assert.deepEqual(Array.from(messages[0].primaryClues), ["Team Rocket's Mimikyu"]);
    assert.equal(messages[0].title, "Team Rocket's Mimikyu illustration");
});

test('Vinted keyword defaults select Pokemon-name-like and variation clues', () => {
    const appended = [];
    const chips = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            extractTitleInfo: (title) => ({
                pokemonName: /^reshiram$/i.test(String(title || '').trim()) ? 'reshiram' : null,
            }),
        },
        document: {
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => {
                const node = {
                    tagName: tagName.toUpperCase(),
                    style: {},
                    attributes: {},
                    children: [],
                    textContent: '',
                    type: '',
                    setAttribute(name, value) {
                        this.attributes[name] = value;
                    },
                    appendChild(child) {
                        this.children.push(child);
                        if (child.attributes?.['data-pokoin-vinted-keyword']) {
                            chips.push(child);
                        }
                    },
                    addEventListener() {},
                    querySelector() {
                        return { style: {} };
                    },
                };
                return node;
            },
            body: {
                appendChild(element) {
                    appended.push(element);
                    element.parentNode = this;
                    element.parentElement = this;
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentButton = createButtonStub();

    processor.renderKeywordToggles(
        'Carta Pokemon Reshiram',
        'Carte perfetta.'
    );

    const labels = processor.currentKeywords.map((keyword) => keyword.label);
    const selectedLabels = processor.selectedKeywordLabels();

    assert.ok(labels.includes('Reshiram'), 'Reshiram should be extracted from description text');
    assert.equal(processor.currentKeywords.find((keyword) => keyword.label === 'Reshiram').selectedByDefault, true);
    assert.ok(processor.currentKeywords.some((keyword) => keyword.label === 'perfetta' && keyword.selectedByDefault === false));
    assert.equal(labels.includes('Carta'), false);
    assert.equal(labels.includes('Carte'), false);
    assert.deepEqual([...selectedLabels], ['Reshiram']);
    assert.equal(chips.find((chip) => chip.textContent === 'Reshiram').attributes['aria-pressed'], 'true');
    assert.equal(chips.find((chip) => chip.textContent === 'perfetta').attributes['aria-pressed'], 'false');
    assert.equal(appended.length, 1, 'keyword chip container should render');
});

test('Vinted default-off clues are omitted from background search query', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/4-reshiram', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /^reshiram$/i.test(String(title || '').trim()) ? 'reshiram' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Carta Pokemon';
    processor.currentKeywords = processor.extractVintedKeywords(
        processor.currentTitle,
        'Reshiram card perfetta condizioni 114/113'
    );
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    assert.deepEqual([...messages[0].clues], ['Reshiram']);
    assert.match(messages[0].title, /Reshiram/);
    assert.doesNotMatch(messages[0].title, /perfetta/i);
    assert.doesNotMatch(messages[0].title, /114\/113/);
    assert.doesNotMatch(messages[0].title, /\b(?:carta|card|carte|cards)\b/i);
});

test('Vinted selected Pokemon clue overrides noisy title terms', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/5-reshiram', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /^reshiram$/i.test(String(title || '').trim()) ? 'reshiram' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Carta Pokémon reshiram B/N ita';
    processor.currentKeywords = processor.extractVintedKeywords(
        processor.currentTitle,
        'Nita trainer card in condizioni perfette'
    );
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);
    await processor.openPokoinSidePanel();

    assert.deepEqual([...messages[0].clues], ['reshiram']);
    assert.deepEqual([...messages[0].primaryClues], ['reshiram']);
    assert.equal(messages[0].title, 'reshiram');
    assert.doesNotMatch(messages[0].title, /Nita|B\/N|ita/i);
    assert.equal(messages[1].action, 'openSidePanelForCurrentTab');
    assert.deepEqual([...messages[1].clues], ['reshiram']);
    assert.deepEqual([...messages[1].primaryClues], ['reshiram']);
});

test('Vinted Base Set clue is manual unless user selects it', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/8970268220-pokemon-mewtwo-set-base', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /^mewtwo$/i.test(String(title || '').trim()) ? 'Mewtwo' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Pokémon Mewtwo set base';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);
    assert.deepEqual([...messages[0].primaryClues], ['Mewtwo']);
    assert.deepEqual([...messages[0].clues], ['Mewtwo']);
    assert.equal(messages[0].title, 'Mewtwo');

    processor.selectedKeywordValues.add(processor.currentKeywords.find((keyword) => keyword.compact === 'baseset').compact);
    await processor.openPokoinSidePanel();
    assert.ok(messages[1].clues.some((clue) => /^Base Set$/i.test(clue)));
    assert.equal(messages[1].title, 'Mewtwo Base Set');
});

test('Vinted fullart title defaults illustration clue on', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/91-froslass-fullart', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /^froslass$/i.test(String(title || '').trim()) ? 'Froslass' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Pokémon Froslass Fullart';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, 'Fullart Scrivimi');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    assert.ok(processor.currentKeywords.some((keyword) => keyword.value === 'illustration' && keyword.selectedByDefault === true));
    assert.ok(!processor.currentKeywords.some((keyword) => /Fullart Scrivimi/i.test(keyword.value)));
    assert.deepEqual([...messages[0].primaryClues], ['Froslass']);
    assert.deepEqual(Array.from(messages[0].clues), ['Froslass', 'illustration']);
    assert.equal(messages[0].title, 'Froslass illustration');
});

test('Vinted Holo stays a weak feature and cannot outrank Espeon name', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/92-espeon-holo-neo', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => {
                const value = String(title || '').trim().toLowerCase();
                if (value === 'espeon' || value === 'espeon holo') {
                    return { pokemonName: 'Espeon' };
                }
                if (value === 'holo') {
                    return { pokemonName: 'Holon' };
                }
                return { pokemonName: null };
            },
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Espeon Holo neo discovery';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, 'Olografia tenuta perfettamente');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const labels = processor.currentKeywords.map((keyword) => keyword.label);
    const holoKeyword = processor.currentKeywords.find((keyword) => keyword.compact === 'holo');
    processor.selectedKeywordValues.add(holoKeyword.compact);
    const payloadWithHolo = processor.buildVintedPayload(processor.currentTitle, processor.selectedKeywordLabels());
    assert.ok(labels.includes('Espeon'), 'Espeon should remain the name chip');
    assert.ok(labels.includes('Holo'), 'Holo should remain available as a feature chip');
    assert.ok(labels.includes('Neo Discovery'), 'Neo Discovery should be expansion evidence');
    assert.equal(holoKeyword?.category, 'feature');
    assert.equal(holoKeyword?.nameLike, false);
    assert.deepEqual([...messages[0].primaryClues], ['Espeon']);
    assert.equal(messages[0].vintedPayload.name, 'Espeon');
    assert.equal(messages[0].vintedPayload.expansion, 'Neo Discovery');
    assert.equal(payloadWithHolo.name, 'Espeon');
    assert.equal(payloadWithHolo.features.includes('Holo'), true);
    assert.doesNotMatch(messages[0].title, /Holon/i);
});

test('Vinted selected keyword toggles shape background and side-panel messages', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/2-dragonite', hostname: 'www.vinted.it' },
            innerWidth: 1024,
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Dragonite V carta Pokemon';
    processor.currentKeywords = processor.extractVintedKeywords(
        processor.currentTitle,
        'Card SWSH154 carte Evolving Skies 192/203'
    );
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => ['swsh154', 'evolvingskies'].includes(keyword.compact))
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);
    await processor.openPokoinSidePanel();

    assert.equal(messages[0].action, 'searchCardForTitle');
    assert.deepEqual([...messages[0].clues], ['Evolving Skies', 'SWSH154']);
    assert.match(messages[0].title, /Dragonite V/);
    assert.match(messages[0].title, /Evolving Skies/);
    assert.match(messages[0].title, /SWSH154/);
    assert.doesNotMatch(messages[0].title, /\b(?:carta|card|carte|cards)\b/i);
    assert.equal(messages[1].action, 'openSidePanelForCurrentTab');
    assert.deepEqual([...messages[1].clues], ['Evolving Skies', 'SWSH154']);
    assert.deepEqual([...messages[1].primaryClues], []);
});

test('Vinted chip toggle invalidates stale preview rows before side-panel open', async () => {
    const messages = [];
    let searchCount = 0;
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/8-pikachu-gengar', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /pikachu/i.test(String(title || '')) ? 'Pikachu' : /gengar/i.test(String(title || '')) ? 'Gengar' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    if (message.action !== 'searchCardForTitle') {
                        return { success: true };
                    }
                    searchCount += 1;
                    if (searchCount === 1) {
                        return {
                            success: true,
                            results: [{ blueprint_id: 'gengar-v', name_en: 'Gengar V', collector_number: '156/264', search_score: 99 }],
                        };
                    }
                    return new Promise(() => {});
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Pikachu V Illustration Gengar V';
    processor.currentKeywords = [
        { label: 'Gengar V', value: 'Gengar V', compact: 'gengarv', nameLike: true, attachedNamePhrase: true, category: 'name', selectedByDefault: true },
        { label: 'Pikachu V', value: 'Pikachu V', compact: 'pikachuv', nameLike: true, attachedNamePhrase: true, category: 'name', selectedByDefault: false },
        { label: 'V', value: 'V', compact: 'v', variation: true, category: 'variation', selectedByDefault: true },
        { label: 'illustration', value: 'illustration', compact: 'illustration', illustration: true, category: 'feature', selectedByDefault: false },
        { label: 'Pikachu VTG16/TG30', value: 'Pikachu VTG16/TG30', compact: 'pikachuvtg16tg30', collectorNumber: true, category: 'collector', selectedByDefault: false },
    ];
    processor.selectedKeywordValues = new Set(['gengarv', 'v']);
    processor.currentButton = createButtonStub();

    await processor.runVintedSearch(processor.extractTitleInfo(processor.currentTitle), processor.currentTitle, 'initial');
    assert.deepEqual(processor.currentPreviewResults().map((row) => row.blueprint_id), ['gengar-v']);

    processor.selectedKeywordValues = new Set(['pikachuv', 'v', 'illustration', 'pikachuvtg16tg30']);
    processor.invalidateVintedPreviewForSelectionChange();
    processor.sendVintedTokensReady('keyword-toggle');
    processor.openPokoinSidePanel();

    const latestTokenMessage = messages.filter((message) => message.action === 'marketplacePreviewReady').at(-1);
    const latestOpenMessage = messages.filter((message) => message.action === 'openSidePanelForCurrentTab').at(-1);
    assert.deepEqual([...latestTokenMessage.selectedClues], ['Pikachu V', 'V', 'illustration', 'Pikachu VTG16/TG30']);
    assert.deepEqual([...latestOpenMessage.selectedClues], ['Pikachu V', 'V', 'illustration', 'Pikachu VTG16/TG30']);
    assert.equal(latestOpenMessage.previewRows, undefined);
    assert.doesNotMatch(latestOpenMessage.title, /Gengar/i);
    assert.match(latestOpenMessage.title, /Pikachu V/i);
    assert.ok(latestOpenMessage.selectionRevision > 0);
});

test('Vinted manual clue input adds selected clue and invalidates stale preview rows', async () => {
    const messages = [];
    let searchCount = 0;
    const body = createDomElement('body');
    const titleElement = createDomElement('h1');
    titleElement.textContent = 'Kilowattrel ex';
    body.appendChild(titleElement);
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelector: (selector) => selector === '[data-pokoin-vinted-panel-host]' ? body.querySelector(selector) : null,
            querySelectorAll: () => [],
            createElement: (tag) => createDomElement(tag),
            contains: (element) => body.contains(element),
            body,
            title: 'Kilowattrel ex',
        },
        window: {
            location: { href: 'https://www.vinted.it/items/41-kilowattrel-ex', hostname: 'www.vinted.it', pathname: '/items/41-kilowattrel-ex' },
            extractTitleInfo: (title) => ({
                pokemonName: /kilowattrel/i.test(String(title || '')) ? 'Kilowattrel' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    if (message.action !== 'searchCardForTitle') {
                        return { success: true };
                    }
                    searchCount += 1;
                    if (searchCount === 1) {
                        return {
                            success: true,
                            results: [{ blueprint_id: 'kilowattrel-ex', name_en: 'Kilowattrel ex', collector_number: '068/191', search_score: 99 }],
                        };
                    }
                    return { success: true, results: [{ blueprint_id: 'kilowattrel-manual', name_en: 'Kilowattrel ex', collector_number: '068/191', search_score: 99 }] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Kilowattrel ex';
    processor.currentTitleElement = titleElement;
    processor.createVintedPanelButton(titleElement);
    processor.renderKeywordToggles(processor.currentTitle, '');
    processor.searchResultsBySignature.set(processor.buildVintedSearchSignature(processor.currentTitle), [
        { blueprint_id: 'stale-kilowattrel', name_en: 'Kilowattrel ex' },
    ]);
    processor.lastRenderedPreviewResults = [{ blueprint_id: 'stale-kilowattrel', name_en: 'Kilowattrel ex' }];
    processor.currentMatchCount = 1;

    const input = processor.vintedPanelRoot().querySelector('[data-pokoin-vinted-manual-clue-input]');
    assert.ok(input, 'manual clue input should render in the Vinted overlay');
    input.value = '068/191';
    input.eventListeners.keydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const selectedClues = processor.selectedKeywordLabels();
    const searchMessages = messages.filter((message) => message.action === 'searchCardForTitle');
    const tokenMessage = messages.filter((message) => message.action === 'marketplacePreviewReady').at(-1);
    assert.ok(selectedClues.includes('068/191'));
    assert.equal(selectedClues.filter((clue) => clue === '068/191').length, 1);
    assert.equal(processor.lastRenderedPreviewResults.length, 0, 'manual clue should clear stale rendered rows before new search resolves');
    assert.ok(searchMessages.at(-1).selectedClues.includes('068/191'));
    assert.ok(tokenMessage.selectedClues.includes('068/191'));

    input.value = '068/191';
    input.eventListeners.keydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
    assert.equal(processor.selectedKeywordLabels().filter((clue) => clue === '068/191').length, 1);
});

test('Vinted Trainer Gallery slash collector stays atomic and clears stale rows', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/16-pikachu-v-tg16', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /pikachu/i.test(String(title || '')) ? 'Pikachu' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Carta Pokemon Pikachu V TG16/TG30 di Origine Perduta';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );
    processor.searchResultsBySignature.set('old-signature', [{ blueprint_id: 'gengar-v', name_en: 'Gengar V' }]);
    processor.lastAppliedSearchSignature = 'old-signature';
    processor.lastRenderedPreviewResults = [{ blueprint_id: 'gengar-v', name_en: 'Gengar V' }];

    const selectedLabels = processor.selectedKeywordLabels();
    const payload = processor.buildVintedPayload(processor.currentTitle, selectedLabels);
    await processor.openPokoinSidePanel();

    assert.ok(processor.currentKeywords.some((keyword) => keyword.label === 'TG16/TG30' && keyword.collectorNumber));
    assert.ok(selectedLabels.includes('Pikachu V'));
    assert.ok(selectedLabels.includes('V'));
    assert.ok(selectedLabels.includes('TG16/TG30'));
    assert.ok(selectedLabels.includes('Lost Origin'));
    assert.equal(payload.name, 'Pikachu');
    assert.equal(payload.variation, 'V');
    assert.equal(payload.collectorNumber, 'TG16/TG30');
    assert.equal(payload.numericCollectorNumber, '16');
    assert.equal(payload.expansion, 'Lost Origin');

    const openMessage = messages.at(-1);
    assert.equal(openMessage.action, 'openSidePanelForCurrentTab');
    assert.deepEqual(openMessage.previewRows?.map((row) => row.card_id) || [], []);
    assert.doesNotMatch(JSON.stringify(openMessage), /gengar/i);
    assert.match(openMessage.title, /TG16\/TG30/);
});

test('background ranks Trainer Gallery slash collectors by full prefixed code', () => {
    const sandbox = loadBackgroundHelpers([
        'collectorNumberMatchRank',
        'collectorNumberMatches',
        'sortRowsForStructuredCard',
    ]);
    const structuredCard = {
        name: 'Pikachu',
        searchName: 'Pikachu V',
        variation: 'V',
        collectorNumber: 'TG16/TG30',
        numericCollectorNumber: '16',
        expansion: 'Lost Origin',
    };
    const rows = [
        { card_id: 'plain-16', name: 'Pikachu V', set_name: 'Lost Origin', card_number: '16', search_rank: 9999 },
        { card_id: 'tg16', name: 'Pikachu V', set_name: 'Lost Origin', card_number: 'TG16/TG30', search_rank: 10 },
        { card_id: 'tg17', name: 'Pikachu V', set_name: 'Lost Origin', card_number: 'TG17/TG30', search_rank: 9998 },
    ];
    const sorted = sandbox.sortRowsForStructuredCard(rows, structuredCard);

    assert.equal(sandbox.collectorNumberMatchRank('TG16/TG30', 'TG16/TG30'), 0);
    assert.equal(sandbox.collectorNumberMatches('16', 'TG16/TG30'), false);
    assert.equal(sorted[0].card_id, 'tg16');
});

test('background ranks selected tag-team composite above individual ex rows', () => {
    const sandbox = loadBackgroundHelpers([
        'sortRowsForStructuredCard',
        'rowMatchesStructuredVariation',
    ]);
    const structuredCard = {
        name: 'Espeon & Deoxys ex',
        searchName: 'Espeon & Deoxys ex',
        variation: 'ex',
        variationTokens: ['ex'],
    };
    const rows = [
        { card_id: 'espeon-ex', name: 'Espeon ex', set_name: 'Generic', card_number: '1', search_rank: 999 },
        { card_id: 'deoxys-ex', name: 'Deoxys ex', set_name: 'Generic', card_number: '2', search_rank: 998 },
        { card_id: 'tag-team', name: 'Espeon & Deoxys GX', set_name: 'Unified Minds', card_number: '72/236', search_rank: 50 },
    ];

    const sorted = sandbox.sortRowsForStructuredCard(rows, structuredCard);
    assert.equal(sorted[0].card_id, 'tag-team');
});

test('background ranks Team Rocket owner composite above generic Mimikyu rows', () => {
    const sandbox = loadBackgroundHelpers([
        'sortRowsForStructuredCard',
        'rowMatchesStructuredName',
        'possibleCompositeTitleTerms',
    ]);
    const structuredCard = {
        name: "Team Rocket's Mimikyu",
        searchName: "Team Rocket's Mimikyu",
        variation: '',
    };
    const rows = [
        { card_id: 'generic-mimikyu', name: 'Mimikyu', set_name: 'Guardians Rising', card_number: '58/145', search_rank: 999 },
        { card_id: 'team-rocket-mimikyu', name: "Team Rocket's Mimikyu", set_name: 'Destined Rivals', card_number: '245/182', search_rank: 50 },
    ];

    assert.ok(sandbox.possibleCompositeTitleTerms('Mimikyu del Team Rocket Full Art').includes("Team Rocket's Mimikyu"));
    assert.equal(sandbox.rowMatchesStructuredName(rows[0], structuredCard), false);
    assert.equal(sandbox.rowMatchesStructuredName(rows[1], structuredCard), true);
    assert.equal(sandbox.sortRowsForStructuredCard(rows, structuredCard)[0].card_id, 'team-rocket-mimikyu');
});

test('background rejects plain Charizard ex when Mega X is selected', () => {
    const sandbox = loadBackgroundHelpers([
        'rowMatchesStructuredVariation',
        'sortRowsForStructuredCard',
    ]);
    const structuredCard = {
        name: 'Charizard',
        searchName: 'Mega Charizard X ex',
        variation: 'Mega ex X',
        variationTokens: ['mega', 'ex', 'x'],
        collectorNumber: '13/94',
        numericCollectorNumber: '13',
    };
    const rows = [
        { card_id: 'plain-charizard-ex', name: 'Charizard ex', set_name: 'EX FireRed & LeafGreen', card_number: '105', search_rank: 999 },
        { card_id: 'mega-charizard-x-ex', name: 'Mega Charizard X EX', set_name: 'Flashfire', card_number: '13/94', search_rank: 50 },
    ];

    assert.equal(sandbox.rowMatchesStructuredVariation(rows[0], structuredCard), false);
    assert.equal(sandbox.rowMatchesStructuredVariation(rows[1], structuredCard), true);
    assert.equal(sandbox.sortRowsForStructuredCard(rows, structuredCard)[0].card_id, 'mega-charizard-x-ex');
});

test('background accepts Mega Charizard descendants when only Mega Charizard is selected', () => {
    const sandbox = loadBackgroundHelpers([
        'normalizeMarketplacePayload',
        'rowMatchesStructuredName',
        'rowMatchesStructuredVariation',
        'sortRowsForStructuredCard',
    ]);
    const marketplacePayload = sandbox.normalizeMarketplacePayload({
        source: 'vinted',
        name: 'Charizard',
        searchTitle: 'Mega Charizard',
        selectedClues: ['Mega Charizard'],
        primaryClues: ['Mega Charizard'],
        variation: 'Mega',
    });
    const structuredCard = marketplacePayload.structuredCard;
    const rows = [
        { card_id: 'plain-charizard-ex', name: 'Charizard ex', set_name: 'EX FireRed & LeafGreen', card_number: '105', search_rank: 999999 },
        { card_id: 'mega-charizard-y-ex', name: 'Mega Charizard Y EX', set_name: 'Flashfire', card_number: '69/106', search_rank: 50 },
        { card_id: 'mega-charizard-x-ex', name: 'Mega Charizard X EX', set_name: 'Flashfire', card_number: '13/94', search_rank: 40 },
    ];
    const acceptedRows = rows
        .filter((row) => sandbox.rowMatchesStructuredName(row, structuredCard))
        .filter((row) => sandbox.rowMatchesStructuredVariation(row, structuredCard));
    const sorted = sandbox.sortRowsForStructuredCard(rows, structuredCard);

    assert.equal(structuredCard.variation, 'Mega');
    assert.deepEqual(Array.from(structuredCard.variationTokens), ['mega']);
    assert.deepEqual(acceptedRows.map((row) => row.card_id), ['mega-charizard-y-ex', 'mega-charizard-x-ex']);
    assert.equal(sandbox.rowMatchesStructuredVariation(rows[0], structuredCard), false);
    assert.equal(sandbox.rowMatchesStructuredVariation(rows[1], structuredCard), true);
    assert.equal(sorted[0].card_id, 'mega-charizard-y-ex');
    assert.equal(sorted[1].card_id, 'mega-charizard-x-ex');
    assert.equal(sorted.at(-1).card_id, 'plain-charizard-ex');
});

test('database-observed collector formats stay atomic in marketplace parsers', () => {
    const { Processor: VintedProcessor } = loadProcessor('processors/VINT.js', 'VintedProcessor');
    const vintedProcessor = new VintedProcessor();
    const vintedKeywords = vintedProcessor.extractVintedKeywords(
        'Latias DRS 009 Machamp HL 9 Mew RC32/RC32 Pikachu SV-P 129',
        ''
    );
    const vintedCollectors = vintedKeywords
        .filter((keyword) => keyword.collectorNumber)
        .map((keyword) => keyword.label);

    assert.ok(vintedCollectors.includes('DRS 009'));
    assert.ok(vintedCollectors.includes('HL 9'));
    assert.ok(vintedCollectors.includes('RC32/RC32'));
    assert.ok(vintedCollectors.includes('SV-P 129'));
    assert.equal(vintedProcessor.normalizeVintedCollectorNumber('DRS 009'), 'DRS 009');
    assert.equal(vintedProcessor.normalizeVintedCollectorNumber('HL 9'), 'HL 9');
    assert.equal(vintedProcessor.normalizeVintedCollectorNumber('RC32/RC32'), 'RC32/RC32');
    assert.equal(vintedProcessor.normalizeVintedCollectorNumber('SV-P 129'), 'SV-P 129');

    const { Processor: EbayProcessor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor');
    const ebayProcessor = new EbayProcessor();
    assert.equal(ebayProcessor.extractCollectorNumber({}, 'Pokemon Latias DRS 009 Dragon Selection'), 'DRS 009');
    assert.equal(ebayProcessor.extractCollectorNumber({}, 'Pokemon Machamp HL 9 EX Hidden Legends'), 'HL 9');
    assert.equal(ebayProcessor.extractCollectorNumber({}, 'Mew RC32/RC32 Radiant Collection'), 'RC32/RC32');
});

test('background structured parser preserves prefixed collector evidence for API payloads', () => {
    const sandbox = loadBackgroundHelpers([
        'scrapeStructuredCardFields',
        'collectorNumberForExtensionPayload',
        'collectorNumberMatchRank',
        'sortRowsForStructuredCard',
    ]);
    const structuredCard = sandbox.scrapeStructuredCardFields('Latias DRS 009', { expansion: 'Dragon Selection' });
    const rows = [
        { card_id: 'plain-009', name: 'Latias', set_name: 'Dragon Selection', card_number: '009/020', search_rank: 500 },
        { card_id: 'wrong-prefix', name: 'Latias', set_name: 'Dragon Selection', card_number: 'POR 009', search_rank: 10 },
        { card_id: 'drs-009', name: 'Latias', set_name: 'Dragon Selection', card_number: 'DRS 009', search_rank: 300 },
    ];

    assert.equal(structuredCard.name, 'Latias');
    assert.equal(structuredCard.collectorNumber, 'DRS 009');
    assert.equal(structuredCard.printedCollectorNumber, 'DRS 009');
    assert.equal(structuredCard.numericCollectorNumber, '009');
    assert.equal(sandbox.collectorNumberForExtensionPayload(structuredCard), 'DRS 009');
    assert.equal(sandbox.collectorNumberMatchRank('DRS 009', 'DRS 009'), 0);
    assert.ok(sandbox.collectorNumberMatchRank('009/020', 'DRS 009') > 0);
    assert.equal(sandbox.sortRowsForStructuredCard(rows, structuredCard)[0].card_id, 'drs-009');
});

test('Vinted title collector number and localized expansion are selected and structured', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/42-pikachu-evoluzioni', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /^pikachu$/i.test(String(title || '').trim()) ? 'Pikachu' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Pikachu, Evoluzioni 35/108';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(processor.currentTitle);

    const selectedLabels = processor.selectedKeywordLabels();
    assert.ok(processor.currentKeywords.some((keyword) => keyword.label === '35/108'), 'collector number chip should render');
    assert.ok(processor.currentKeywords.some((keyword) => keyword.label === 'Evolutions'), 'Italian Evoluzioni should map to Evolutions chip');
    assert.ok(selectedLabels.includes('Pikachu'), 'Pokemon name should default selected');
    assert.ok(selectedLabels.includes('35/108'), 'title collector number should default selected');
    assert.ok(selectedLabels.includes('Evolutions'), 'title expansion alias should default selected');
    assert.deepEqual([...messages[0].primaryClues], ['Pikachu']);
    assert.ok(messages[0].clues.includes('35/108'));
    assert.ok(messages[0].clues.includes('Evolutions'));
    assert.match(messages[0].title, /Pikachu/);
    assert.match(messages[0].title, /Evolutions/);
    assert.match(messages[0].title, /35\/108/);
});

test('Vinted collector chip toggle changes signature and ignores stale results', async () => {
    const messages = [];
    let resolveFirst;
    const firstResponse = new Promise((resolve) => {
        resolveFirst = resolve;
    });
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/43-pikachu', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /^pikachu$/i.test(String(title || '').trim()) ? 'Pikachu' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    if (messages.length === 1) {
                        return firstResponse;
                    }
                    return {
                        success: true,
                        results: [{ name_en: 'Pikachu', collector_number: '35/108', expansion_name_en: 'Evolutions', search_score: 95 }],
                    };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Pikachu';
    processor.currentButton = createButtonStub();
    processor.renderCandidatePreview = (results) => {
        processor.previewResults = results;
    };
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '35/108');
    processor.selectedKeywordValues = new Set(['pikachu']);

    const firstSearch = processor.runVintedSearch({}, processor.currentTitle, 'initial');
    await Promise.resolve();
    processor.selectedKeywordValues.add('35108');
    const secondSearch = processor.runVintedSearch({}, processor.currentTitle, 'keyword-toggle');
    await secondSearch;
    resolveFirst({ success: true, results: [{ name_en: 'Pikachu', collector_number: '179/165', expansion_name_en: 'Pokemon 151', search_score: 99 }] });
    await firstSearch;

    const searchMessages = messages.filter((message) => message.action === 'searchCardForTitle');
    assert.equal(searchMessages.length, 2, 'toggle should send one new background search');
    assert.deepEqual([...searchMessages[0].clues], ['Pikachu']);
    assert.deepEqual([...searchMessages[1].clues], ['Pikachu', '35/108']);
    assert.match(searchMessages[1].title, /35\/108/);
    assert.equal(processor.previewResults[0].collector_number, '35/108', 'stale earlier results should not replace toggled results');
});

test('Vinted side panel payload includes selected clues and preview rows', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/90-tornadus-ex', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /tornadus/i.test(String(title || '')) ? 'Tornadus' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return {
                        success: true,
                        results: [
                            { blueprint_id: '96', name_en: 'Tornadus EX', expansion_name_en: 'BW Black Star Promos', collector_number: '96', search_score: 99 },
                            { blueprint_id: '90', name_en: 'Tornadus EX', expansion_name_en: 'Dark Explorers', collector_number: '90', search_score: 95 },
                        ],
                    };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Tornadus EX Full Art';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, 'Carta Tornadus EX Full Art');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault || keyword.compact === 'illustration')
            .map((keyword) => keyword.compact)
    );
    processor.currentButton = createButtonStub();
    processor.renderCandidatePreview = () => {};

    await processor.searchCardWithBackground(processor.currentTitle);
    await processor.openPokoinSidePanel();

    const sidePanelMessage = messages.at(-1);
    assert.equal(sidePanelMessage.action, 'openSidePanelForCurrentTab');
    assert.deepEqual(sidePanelMessage.previewRows.map((row) => row.card_id), ['96', '90']);
    assert.deepEqual(sidePanelMessage.previewRows.map((row) => row.set_name), ['BW Black Star Promos', 'Dark Explorers']);
    assert.ok(sidePanelMessage.clues.some((clue) => /^illustration$/i.test(clue)));
    assert.ok(sidePanelMessage.primaryClues.some((clue) => /^Tornadus ex$/i.test(clue)));
    assert.match(sidePanelMessage.previewSignature, /tornadusex/);
});

test('Vinted structured payload carries selected collector to background and side panel', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/194-lapras', hostname: 'www.vinted.it' },
            extractTitleInfo: (title) => ({
                pokemonName: /lapras/i.test(String(title || '')) ? 'Lapras' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return {
                        success: true,
                        results: [
                            { blueprint_id: 'lapras-194', name_en: 'Lapras', expansion_name_en: 'Stellar Crown', collector_number: '194', search_score: 99 },
                        ],
                    };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Pokemon carta Lapras it 194';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '194 appena sbustata');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault || keyword.compact === '194')
            .map((keyword) => keyword.compact)
    );
    processor.currentButton = createButtonStub();
    processor.renderCandidatePreview = () => {};

    await processor.searchCardWithBackground(processor.currentTitle);
    await processor.openPokoinSidePanel();

    const searchMessage = messages[0];
    const sidePanelMessage = messages.at(-1);
    assert.equal(searchMessage.vintedPayload.collectorNumber, '194');
    assert.equal(searchMessage.vintedPayload.numericCollectorNumber, '194');
    assert.deepEqual(Array.from(searchMessage.vintedPayload.primaryClues), ['Lapras']);
    assert.ok(searchMessage.vintedPayload.selectedClues.includes('194'));
    assert.equal(sidePanelMessage.vintedPayload.collectorNumber, '194');
    assert.deepEqual(sidePanelMessage.previewRows.map((row) => row.card_id), ['lapras-194']);
    assert.equal(processor.vintedDiagnostics.at(-1).payload.collectorNumber, '194');
});

test('Vinted collapsed and reopened overlay preserves canonical preview rows', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: { href: 'https://www.vinted.it/items/91-tornadus-ex', hostname: 'www.vinted.it' },
            extractTitleInfo: () => ({ pokemonName: 'Tornadus' }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return {
                        success: true,
                        results: [
                            { blueprint_id: '96', name_en: 'Tornadus EX', expansion_name_en: 'BW Black Star Promos', collector_number: '96', search_score: 99 },
                            { blueprint_id: '90', name_en: 'Tornadus EX', expansion_name_en: 'Dark Explorers', collector_number: '90', search_score: 95 },
                        ],
                    };
                },
            },
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Tornadus EX Full Art';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, 'Carta Tornadus EX Full Art');
    processor.selectedKeywordValues = new Set(processor.currentKeywords.filter((keyword) => keyword.selectedByDefault).map((keyword) => keyword.compact));
    processor.currentButton = createButtonStub();
    processor.renderCandidatePreview = () => {};

    await processor.searchCardWithBackground(processor.currentTitle);
    processor.setVintedOverlayCollapsed(true);
    await processor.openPokoinSidePanel();
    processor.setVintedOverlayCollapsed(false);
    await processor.openPokoinSidePanel();

    const openMessages = messages.filter((message) => message.action === 'openSidePanelForCurrentTab');
    assert.equal(openMessages.length, 2);
    assert.deepEqual(openMessages[0].previewRows.map((row) => row.card_id), ['96', '90']);
    assert.deepEqual(openMessages[1].previewRows.map((row) => row.card_id), ['96', '90']);
});

test('Vinted placement uses transparent overlay outside product details', () => {
    const bodyAppends = [];
    const body = documentStubBody(bodyAppends);
    const details = createDomElement('section', { 'data-testid': 'item-details' });
    const titleWrapper = createDomElement('div');
    const title = createDomElement('h1', { 'data-testid': 'item-title' });
    const actionArea = createDomElement('div', { 'data-testid': 'item-actions' });
    titleWrapper.appendChild(title);
    details.appendChild(titleWrapper);
    details.appendChild(actionArea);

    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelector: (selector) => selector === '[data-pokoin-vinted-panel]' ? null : null,
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body,
        },
    });
    const processor = new Processor();

    const panel = processor.ensureVintedPanel(title);

    assert.equal(panel.attributes['data-pokoin-extension-panel'], 'vinted-content');
    assert.equal(processor.currentPanelHost.attributes['data-pokoin-vinted-placement'], 'overlay-fixed');
    assert.equal(processor.currentPanelHost.attributes['data-pokoin-extension-panel'], 'vinted');
    assert.equal(processor.currentPanelHost.parentNode, body);
    assert.equal(details.children.includes(processor.currentPanelHost), false);
    assert.equal(bodyAppends[0], processor.currentPanelHost, 'overlay should mount on document body');
    assert.equal(processor.currentPanelHost.style.position, 'fixed');
    assert.ok(processor.currentPanelHost.shadowRoot, 'Vinted panel should use a shadow root when available');
});

function documentStubBody(appends) {
    return {
        appendChild(element) {
            appends.push(element);
            element.parentNode = this;
            element.parentElement = this;
        },
    };
}

test('Vinted overlay panel is fixed without a safe anchor', () => {
    const bodyAppends = [];
    const body = documentStubBody(bodyAppends);
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            extractTitleInfo: (title) => ({
                pokemonName: /tornadus/i.test(String(title || '')) ? 'Tornadus' : null,
            }),
        },
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body,
        },
    });
    const processor = new Processor();

    const panel = processor.ensureVintedPanel(null);

    assert.equal(processor.currentPanelHost.attributes['data-pokoin-vinted-placement'], 'overlay-fixed');
    assert.equal(processor.currentPanelHost.style.position, 'fixed');
    assert.equal(processor.currentPanelHost.style.left, '12px');
    assert.equal(processor.currentPanelHost.style.top, '12px');
    assert.equal(processor.currentPanelHost.style.bottom, 'auto');
    assert.equal(processor.currentPanelHost.style.right, 'auto');
    assert.equal(processor.currentPanelHost.style.maxHeight, 'calc(100vh - 24px)');
    assert.equal(processor.currentPanelHost.style.pointerEvents, 'none');
    assert.equal(panel.style.pointerEvents, 'auto');
    assert.equal(bodyAppends[0], processor.currentPanelHost);
});

test('Vinted overlay collapse toggles chips and candidate preview', () => {
    const bodyAppends = [];
    const body = documentStubBody(bodyAppends);
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body,
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Tornadus EX';
    processor.currentKeywords = [{ label: 'Tornadus ex', value: 'Tornadus ex', compact: 'tornadusex', selectedByDefault: true }];
    processor.selectedKeywordValues = new Set(['tornadusex']);
    processor.createVintedPanelButton();
    processor.renderKeywordToggles('Tornadus EX', '');
    processor.renderCandidatePreview([{ blueprint_id: '96', expansion_name_en: 'BW Black Star Promos', collector_number: '96' }]);

    const root = processor.vintedPanelRoot();
    const header = root.querySelector('[data-pokoin-vinted-header-row]');
    const toggle = root.querySelector('[data-pokoin-vinted-collapse-toggle]');
    const keywords = root.querySelector('[data-pokoin-vinted-keywords]');
    const preview = root.querySelector('[data-pokoin-candidate-preview]');

    assert.ok(header, 'header row should contain the Pokoin and collapse buttons');
    assert.deepEqual(header.children.map((child) => child.attributes['data-pokemon-linker-button'] ? 'button' : 'toggle'), ['button', 'toggle']);
    assert.match(toggle.style.cssText, /width:\s*40px/);
    assert.match(toggle.style.cssText, /height:\s*40px/);
    assert.match(processor.currentButton.style.cssText, /flex:\s*1 1 auto/i);
    assert.match(processor.currentButton.innerHTML, /Pokoin\.com \(1 match\)/);

    processor.setVintedOverlayCollapsed(true);
    assert.equal(processor.currentPanelHost.attributes['data-pokoin-vinted-collapsed'], 'true');
    assert.equal(processor.currentPanelHost.style.pointerEvents, 'none');
    assert.equal(processor.currentPanel.style.pointerEvents, 'auto');
    assert.equal(keywords.style.display, 'none');
    assert.equal(preview.style.display, 'none');
    assert.equal(toggle.attributes['aria-expanded'], 'false');
    assert.equal(toggle.textContent, '+');
    assert.match(processor.currentButton.innerHTML, /1 match/);

    processor.setVintedOverlayCollapsed(false);
    assert.equal(processor.currentPanelHost.attributes['data-pokoin-vinted-collapsed'], 'false');
    assert.equal(keywords.style.display, '');
    assert.equal(preview.style.display, '');
    assert.equal(toggle.attributes['aria-expanded'], 'true');
    assert.equal(toggle.textContent, 'X');
    assert.match(processor.currentButton.innerHTML, /Pokoin\.com \(1 match\)/);
});

test('Vinted candidate preview uses viewport height and remains scrollable', () => {
    const bodyAppends = [];
    const body = documentStubBody(bodyAppends);
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body,
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Tornadus EX';
    processor.createVintedPanelButton();

    processor.renderCandidatePreview([{ blueprint_id: '96', expansion_name_en: 'BW Black Star Promos', collector_number: '96' }]);

    const preview = processor.vintedPanelRoot().querySelector('[data-pokoin-candidate-preview]');
    assert.equal(preview.style.maxHeight, 'calc(100vh - 220px)');
    assert.equal(preview.style.overflowY, 'auto');
});

test('Vinted side-panel open sends overlay preview rows and selected clues', async () => {
    const sentMessages = [];
    const bodyAppends = [];
    const body = documentStubBody(bodyAppends);
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: {
                href: 'https://www.vinted.it/items/91-tornadus-ex-full-art',
                hostname: 'www.vinted.it',
                pathname: '/items/91-tornadus-ex-full-art',
            },
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    sentMessages.push(message);
                    return { success: true };
                },
            },
        },
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body,
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Tornadus EX Full Art';
    processor.currentKeywords = [
        { label: 'Tornadus ex', value: 'Tornadus ex', compact: 'tornadusex', nameLike: true, attachedNamePhrase: true, attachedVariation: false },
        { label: 'ex', value: 'ex', compact: 'ex', nameLike: false, attachedNamePhrase: false, attachedVariation: true },
        { label: 'illustration', value: 'illustration', compact: 'illustration', nameLike: false, attachedNamePhrase: false, attachedVariation: false },
    ];
    processor.selectedKeywordValues = new Set(['tornadusex', 'ex', 'illustration']);
    const signature = processor.buildVintedSearchSignature(processor.currentTitle, processor.selectedKeywordLabels());
    processor.searchResultsBySignature.set(signature, [
        { card_id: '96', name: 'Tornadus EX', set_name: 'BW Black Star Promos', card_number: '96', search_rank: 99 },
        { card_id: '90', name: 'Tornadus EX', set_name: 'Dark Explorers', card_number: '90', search_rank: 95 },
    ]);
    processor.createVintedPanelButton();

    await processor.openPokoinSidePanel();

    const message = sentMessages.at(-1);
    assert.equal(message.action, 'openSidePanelForCurrentTab');
    assert.equal(message.previewSource, 'vinted_overlay');
    assert.equal(message.previewSignature, signature);
    assert.deepEqual(message.previewRows.map((row) => row.card_id), ['96', '90']);
    assert.deepEqual(message.previewRows.map((row) => row.set_name), ['BW Black Star Promos', 'Dark Explorers']);
    assert.deepEqual(message.clues, ['Tornadus ex', 'ex', 'illustration']);
    assert.deepEqual(message.primaryClues, ['Tornadus ex', 'ex']);
});

test('Vinted chip and button share overlay panel', () => {
    const details = createDomElement('section', { 'data-testid': 'item-details' });
    const title = createDomElement('h1', { 'data-testid': 'item-title' });
    const actionArea = createDomElement('div', { 'data-testid': 'item-actions' });
    details.appendChild(title);
    details.appendChild(actionArea);

    const bodyAppends = [];
    const body = documentStubBody(bodyAppends);
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            extractTitleInfo: () => ({ pokemonName: null }),
        },
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body,
        },
    });
    const processor = new Processor();
    processor.currentTitleElement = title;

    processor.createVintedPanelButton(title);
    processor.renderKeywordToggles('Carta Pokemon Dragonite', 'SWSH154 Evolving Skies');

    const host = bodyAppends.find((child) => child.attributes['data-pokoin-vinted-panel-host'] === 'true');
    const panel = host.shadowRoot.querySelector('[data-pokoin-vinted-panel]');
    assert.ok(panel, 'panel should be inserted into overlay');
    assert.equal(host.attributes['data-pokoin-vinted-placement'], 'overlay-fixed');
    assert.equal(host.style.position, 'fixed');
    assert.equal(details.children.includes(host), false);
    const header = panel.querySelector('[data-pokoin-vinted-header-row]');
    assert.ok(header.children.some((child) => child.attributes['data-pokemon-linker-button'] === 'true'));
    assert.ok(panel.children.some((child) => child.attributes['data-pokoin-vinted-keywords'] === 'true'));
    assert.match(
        panel.children.find((child) => child.attributes['data-pokoin-vinted-keywords'] === 'true').style.cssText,
        /flex-wrap:\s*wrap/
    );
});

test('Vinted panel host owns an isolated shadow root with reset styles', () => {
    const details = createDomElement('section', { 'data-testid': 'item-details' });
    const title = createDomElement('h1', { 'data-testid': 'item-title' });
    details.appendChild(title);

    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            contains: (element) => details.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            body: { appendChild() {} },
        },
    });
    const processor = new Processor();

    const panel = processor.ensureVintedPanel(title);
    const host = processor.currentPanelHost;
    const resetStyle = host.shadowRoot.children.find((child) => child.tagName === 'STYLE');

    assert.equal(host.attributes['data-pokoin-extension-panel'], 'vinted');
    assert.equal(panel.attributes['data-pokoin-extension-panel'], 'vinted-content');
    assert.equal(host.shadowRoot.contains(panel), true);
    assert.match(resetStyle.textContent, /:host\s*\{/);
    assert.match(resetStyle.textContent, /all:\s*initial/);
    assert.equal(host.style.all, 'initial');
    assert.equal(host.style.contain, 'layout style');
});

test('Vinted ensure panel reuses owned host and removes duplicates', () => {
    const bodyAppends = [];
    const body = documentStubBody(bodyAppends);
    const details = createDomElement('section', { 'data-testid': 'item-details' });
    const title = createDomElement('h1', { 'data-testid': 'item-title' });
    details.appendChild(title);

    const duplicateHost = createDomElement('div', { 'data-pokoin-vinted-panel-host': 'true' });
    details.appendChild(duplicateHost);

    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelector: () => null,
            querySelectorAll: (selector) => selector === '[data-pokoin-vinted-panel-host]'
                ? details.querySelectorAll(selector)
                : [],
            contains: (element) => details.contains(element) || bodyAppends.includes(element),
            createElement: (tagName) => createDomElement(tagName),
            body,
        },
    });
    const processor = new Processor();

    const firstPanel = processor.ensureVintedPanel(title);
    const firstHost = processor.currentPanelHost;
    const secondPanel = processor.ensureVintedPanel(title);

    assert.equal(secondPanel, firstPanel);
    assert.equal(processor.currentPanelHost, firstHost);
    assert.equal(bodyAppends.filter((child) => child.attributes['data-pokoin-vinted-panel-host'] === 'true').length, 1);
    assert.equal(details.querySelectorAll('[data-pokoin-vinted-panel-host]').length, 0);
    assert.equal(details.querySelectorAll('[data-pokoin-vinted-panel]').length, 0, 'shadow panel should not leak into page queries');
});

test('Vinted panel reinserts owned root after SPA removal', () => {
    const details = createDomElement('section', { 'data-testid': 'item-details' });
    const title = createDomElement('h1', { 'data-testid': 'item-title' });
    const actionArea = createDomElement('div', { 'data-testid': 'item-actions' });
    details.appendChild(title);
    details.appendChild(actionArea);
    let observerCallback = null;
    let scheduledCallback = null;

    class TestMutationObserver {
        constructor(callback) {
            observerCallback = callback;
        }
        observe() {}
    }

    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        MutationObserver: TestMutationObserver,
        document: {
            querySelector: () => null,
            querySelectorAll: (selector) => selector === '[data-pokoin-vinted-panel-host]'
                ? details.querySelectorAll(selector)
                : [],
            contains: (element) => details.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            body: details,
        },
        setTimeout: (callback) => {
            scheduledCallback = callback;
            return 1;
        },
    });
    const processor = new Processor();
    processor.currentTitleElement = title;
    const panel = processor.ensureVintedPanel(title);
    const host = processor.currentPanelHost;

    host.remove();
    observerCallback();
    scheduledCallback();

    assert.equal(processor.currentPanel, panel);
    assert.equal(processor.currentPanelHost, host);
    assert.equal(host.parentNode, details);
    assert.equal(host.attributes['data-pokoin-vinted-placement'], 'overlay-fixed');
    assert.equal(details.querySelectorAll('[data-pokoin-vinted-panel-host]').length, 1);
});

test('Vinted safe anchor selection ignores ad, header, and category placeholders', () => {
    const adPlaceholder = createDomElement('div', { 'data-testid': 'ad-placeholder' });
    const fakeAdTitle = createDomElement('h1');
    fakeAdTitle.textContent = 'Advertisement';
    adPlaceholder.appendChild(fakeAdTitle);

    const header = createDomElement('header');
    const fakeHeaderTitle = createDomElement('h1');
    fakeHeaderTitle.textContent = 'Pokemon cards category';
    header.appendChild(fakeHeaderTitle);

    const details = createDomElement('section', { 'data-testid': 'item-page-summary-plugin' });
    const productTitle = createDomElement('h1', { 'data-testid': 'item-title' });
    productTitle.textContent = 'Dragonite V Pokemon card';
    const actionArea = createDomElement('div', { 'data-testid': 'item-actions' });
    details.appendChild(productTitle);
    details.appendChild(actionArea);

    const allTitles = [fakeAdTitle, fakeHeaderTitle, productTitle];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelector: () => null,
            querySelectorAll: (selector) => {
                if (selector.includes('h1') || selector === '[data-testid="item-title"]') {
                    return allTitles.filter((element) => element.matches?.(selector) || selector === 'h1');
                }
                return [];
            },
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body: { appendChild() {} },
        },
    });
    const processor = new Processor();

    const anchor = processor.resolveVintedProductAnchor();
    const panel = processor.ensureVintedPanel(anchor.titleElement);

    assert.equal(anchor.titleElement, productTitle);
    assert.equal(anchor.detailsContainer, details);
    assert.equal(processor.currentPanelHost.attributes['data-pokoin-vinted-placement'], 'overlay-fixed');
    assert.notEqual(processor.currentPanelHost.parentNode, details);
});

test('Vinted processing waits when only top skeleton title exists', () => {
    const skeleton = createDomElement('div', { 'data-testid': 'item-skeleton' });
    const fakeTitle = createDomElement('h1');
    fakeTitle.textContent = 'Loading';
    skeleton.appendChild(fakeTitle);
    let scheduledDelay = null;
    let scheduledCallback = null;

    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: {
                href: 'https://www.vinted.it/items/9-loading',
                hostname: 'www.vinted.it',
                pathname: '/items/9-loading',
            },
        },
        document: {
            querySelector: () => null,
            querySelectorAll: (selector) => selector.includes('h1') ? [fakeTitle] : [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body: { appendChild() {} },
        },
        setTimeout: (callback, delay) => {
            scheduledCallback = callback;
            scheduledDelay = delay;
            return 1;
        },
    });
    const processor = new Processor();

    const scheduled = processor.scheduleVintedProductRetry('safe item title not found');

    assert.equal(scheduled, true);
    assert.equal(scheduledDelay, processor.vintedProcessRetryDelayMs);
    assert.equal(typeof scheduledCallback, 'function');
    assert.equal(processor.processedPages.has('https://www.vinted.it/items/9-loading'), false);
});

test('Vinted background candidates use active blue styling and render preview', async () => {
    const appended = [];
    const button = createDomElement('button');
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelectorAll: () => [],
            contains: (element) => element === button || element?.attributes?.['data-pokoin-candidate-preview'],
            createElement: (tagName) => {
                const node = createButtonStub();
                node.tagName = tagName.toUpperCase();
                node.children = [];
                node.appendChild = (child) => node.children.push(child);
                return node;
            },
            body: {
                appendChild(element) {
                    appended.push(element);
                },
            },
        },
        window: {
            location: { href: 'https://www.vinted.it/items/3-dragonite', hostname: 'www.vinted.it' },
            innerWidth: 1024,
        },
    });
    const processor = new Processor();
    processor.currentButton = button;
    processor.renderCandidatePreview = (results) => {
        appended.push({ previewResults: results });
    };

    processor.updateButtonWithResults([{ name_en: 'Dragonite V', search_score: 92, collector_number: 'SWSH154' }]);

    assert.equal(processor.currentButton.style.background, '#0ea5e9');
    assert.equal(processor.currentButton.style.border, '2px solid #38bdf8');
    assert.equal(processor.currentButton.innerHTML.includes('Pokoin.com (1 match)'), true);
    assert.equal(processor.currentButton.attributes['data-pokoin-match-count'], '1');
    assert.equal(processor.currentButton.attributes['data-pokemon-linker-fallback'], undefined);
    assert.equal(appended.at(-1).previewResults[0].name_en, 'Dragonite V');
});

test('Vinted unmatched button stays muted Pokoin blue', async () => {
    const button = createButtonStub();
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelectorAll: () => [],
            contains: (element) => element === button,
            createElement: (tagName) => createDomElement(tagName),
            body: { appendChild() {} },
        },
        window: {
            location: { href: 'https://www.vinted.it/items/3-dragonite', hostname: 'www.vinted.it' },
        },
    });
    const processor = new Processor();
    processor.currentButton = button;
    processor.renderCandidatePreview = () => {};

    processor.updateButtonWithoutResults();

    assert.equal(processor.currentButton.style.background, '#075985');
    assert.equal(processor.currentButton.style.border, '1px solid rgba(56, 189, 248, 0.35)');
    assert.equal(processor.currentButton.attributes['data-pokemon-linker-fallback'], 'true');
    assert.equal(processor.currentButton.attributes['data-pokoin-match-count'], '0');
});

test('Vinted Mega Charizard overlay label counts found candidates only', async () => {
    const messages = [];
    const panel = createDomElement('div', { 'data-pokoin-vinted-panel': 'true' });
    const button = createButtonStub();
    button.contains = (target) => target === button;
    panel.appendChild(button);
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: {
                href: 'https://www.vinted.it/items/223-mega-charizard-ex',
                hostname: 'www.vinted.it',
                pathname: '/items/223-mega-charizard-ex',
            },
            extractTitleInfo: (title) => ({
                pokemonName: /charizard/i.test(String(title || '')) ? 'Charizard' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true };
                },
            },
        },
        document: {
            querySelectorAll: () => [],
            contains: (element) => panel.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            body: panel,
        },
    });
    const processor = new Processor();
    processor.currentPanel = panel;
    processor.currentButton = button;
    processor.currentTitle = 'Mega Charizard ex';
    processor.currentKeywords = processor.extractVintedKeywords(processor.currentTitle, '');
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    const results = [
        { blueprint_id: 'mega-charizard-ex-223', name_en: 'Mega Charizard ex', expansion_name_en: 'MEGA Dream ex', collector_number: '223', search_score: 99 },
        { blueprint_id: 'mega-charizard-ex-766', name_en: 'Mega Charizard ex', expansion_name_en: 'MEGA Start Deck 100 Battle Collection', collector_number: '766', search_score: 98 },
        { blueprint_id: 'mega-charizard-ex-085', name_en: 'Mega Charizard ex', expansion_name_en: 'MEGA Start Deck 100 Battle Collection', collector_number: '085', search_score: 97 },
    ];

    const searchSignature = processor.buildVintedSearchSignature(processor.currentTitle);
    processor.applyVintedSearchResults(searchSignature, results, {
        title: processor.currentTitle,
        trigger: 'mega-charizard-regression',
    });

    const clueChips = processor.currentKeywords.length;
    assert.ok(clueChips > results.length, 'test fixture should include extra title/context chips');
    assert.equal(processor.currentMatchCount, 3);
    assert.equal(processor.currentButton.attributes['data-pokoin-match-count'], '3');
    assert.match(processor.currentButton.innerHTML, /Pokoin\.com \(3 matches\)/);
    assert.doesNotMatch(processor.currentButton.innerHTML, new RegExp(`${clueChips}\\s+matches`));

    processor.setVintedOverlayCollapsed(true);
    assert.match(processor.currentButton.innerHTML, />3 matches</);
    assert.doesNotMatch(processor.currentButton.innerHTML, /Pokoin\.com \(3 matches\)/);

    await processor.openPokoinSidePanel();
    const openMessage = messages.at(-1);
    assert.equal(openMessage.action, 'openSidePanelForCurrentTab');
    assert.deepEqual(openMessage.previewRows.map((row) => row.card_id), ['mega-charizard-ex-223', 'mega-charizard-ex-766', 'mega-charizard-ex-085']);
    assert.deepEqual(openMessage.previewRows.map((row) => row.card_number), ['223', '766', '085']);
});

test('Vinted Pokoin button icon stays compact inside overlay reset', () => {
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor');
    const processor = new Processor();
    const button = createButtonStub();
    const icon = {
        style: {},
        attributes: {},
        setAttribute(name, value) {
            this.attributes[name] = value;
        },
    };
    button.querySelector = (selector) => (selector === 'img' ? icon : null);

    processor.applyPokoinButtonStyles(button);
    const resetStyles = processor.vintedPanelResetStyles();

    assert.equal(icon.attributes['data-pokoin-button-icon'], 'true');
    assert.equal(icon.style.width, '20px');
    assert.equal(icon.style.height, '20px');
    assert.equal(icon.style.minWidth, '20px');
    assert.equal(icon.style.maxWidth, '20px');
    assert.equal(icon.style.flex, '0 0 20px');
    assert.equal(icon.style.objectFit, 'cover');
    processor.setPokoinButtonLabel(button);
    assert.match(button.innerHTML, /class="pokoin-icon"/);
    assert.doesNotMatch(button.innerHTML, /<img(?![^>]*data-pokoin-button-icon)/);
    assert.match(resetStyles, /\[data-pokoin-button-icon\]/);
    assert.match(resetStyles, /\[data-pokoin-vinted-panel\]\s+img/);
    assert.match(resetStyles, /\.pokoin-icon/);
    assert.match(resetStyles, /max-width:\s*20px\s*!important/);
    assert.doesNotMatch(resetStyles, /img\s*\{[^}]*max-width:\s*none/s);
});

test('Vinted candidate preview is scrollable, compact, and clickable', async () => {
    const messages = [];
    const panel = createDomElement('div', { 'data-pokoin-vinted-panel': 'true' });
    const button = createButtonStub();
    button.contains = (target) => target === button;
    panel.appendChild(button);
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            extractTitleInfo: (title) => ({
                pokemonName: /regigigas/i.test(String(title || '')) ? 'Regigigas' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true };
                },
            },
        },
        document: {
            querySelectorAll: () => [],
            contains: (element) => panel.contains(element),
            createElement: (tagName) => {
                const element = createDomElement(tagName);
                let cssText = '';
                Object.defineProperty(element.style, 'cssText', {
                    get() {
                        return cssText;
                    },
                    set(value) {
                        cssText = value;
                    },
                });
                return element;
            },
            body: panel,
        },
    });
    const processor = new Processor();
    processor.currentPanel = panel;
    processor.currentButton = button;
    processor.currentTitle = 'Regigigas VSTAR';
    processor.currentKeywords = processor.extractVintedKeywords(
        processor.currentTitle,
        'Regigigas Vastro Astral Radiance 114/189'
    );
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    processor.renderCandidatePreview(Array.from({ length: 12 }, (_, index) => ({
        blueprint_id: String(9000 + index),
        name_en: 'Regigigas VSTAR',
        collector_number: `${114 + index}/189`,
        expansion_name_en: 'Astral Radiance',
        expansion_symbol_url: index === 0 ? 'https://cdn.example/astral-radiance.png' : '',
        pokoin_price: index === 0 ? '$12.34' : '',
    })));

    const preview = panel.children.find((child) => child.attributes?.['data-pokoin-candidate-preview'] === 'true');
    const rows = preview.children;
    assert.equal(preview.style.maxHeight, 'calc(100vh - 220px)');
    assert.equal(preview.style.overflowY, 'auto');
    assert.equal(rows.length, 8);
    assert.equal(rows[0].tagName, 'BUTTON');
    assert.equal(rows[0].type, 'button');
    assert.equal(rows[0].attributes['data-pokoin-candidate-row'], 'true');
    assert.doesNotMatch(rows[0].innerHTML, /Regigigas VSTAR/);
    assert.match(rows[0].innerHTML, /https:\/\/cdn\.example\/astral-radiance\.png/);
    assert.match(rows[0].innerHTML, /114/);
    assert.match(rows[0].innerHTML, /Astral Radiance/);
    assert.match(rows[0].innerHTML, /\$12\.34/);

    await rows[0].eventListeners.click({
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
    });

    assert.equal(messages.at(-1).action, 'openSidePanelForCurrentTab');
    assert.equal(messages.at(-1).selectedCandidateId, '9000');
    assert.equal(messages.at(-1).selectedCandidate.card_id, '9000');
    assert.equal(messages.at(-1).selectedCandidate.name, 'Regigigas VSTAR');
    assert.equal(messages.at(-1).previewRows.length, 8);
    assert.deepEqual(messages.at(-1).previewRows.map((row) => row.card_id), ['9000', '9001', '9002', '9003', '9004', '9005', '9006', '9007']);
    assert.ok(messages.at(-1).clues.some((clue) => /^regigigas vstar$/i.test(clue)));
    assert.ok(messages.at(-1).clues.some((clue) => /^vstar$/i.test(clue)));
    assert.ok(messages.at(-1).primaryClues.some((clue) => /^regigigas vstar$/i.test(clue)));
    assert.ok(messages.at(-1).primaryClues.some((clue) => /^vstar$/i.test(clue)));

    await rows[0].eventListeners.click({
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
    });
    assert.equal(messages.length, 2, 'one runtime message should be sent for each real candidate click');
});

test('eBay compact candidate preview renders expansion logo when provided', () => {
    const panel = createDomElement('div');
    const button = createButtonStub();
    panel.appendChild(button);
    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: { location: { href: 'https://www.ebay.com/itm/1', hostname: 'www.ebay.com', pathname: '/itm/1' } },
        document: {
            title: 'Mew ex 232/091',
            querySelectorAll: () => [],
            contains: (element) => panel.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            body: panel,
        },
    });
    const processor = new Processor();
    processor.currentButton = button;
    processor.currentTitle = 'Mew ex 232/091';
    processor.ensureEbayPanel = () => panel;
    processor.isEbayOwnedNodeConnected = () => true;

    processor.renderCandidatePreview([{
        blueprint_id: '548832',
        name_en: 'Mew ex',
        collector_number: '232/091',
        expansion_name_en: 'Paldean Fates',
        expansion_symbol_url: 'https://cdn.example/paldean-fates.png',
    }]);

    const preview = panel.children.find((child) => child.attributes?.['data-pokoin-candidate-preview'] === 'true');
    assert.match(preview.children[0].innerHTML, /https:\/\/cdn\.example\/paldean-fates\.png/);
    assert.match(preview.children[0].style.cssText, /grid-template-columns:\s*22px minmax\(0, 1fr\)/);
});

test('Vinted candidate metadata includes Pokoin price when available', () => {
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor');
    const processor = new Processor();

    assert.equal(
        processor.compactCandidateMeta({
            collector_number: 'SVP 129',
            expansion_name_en: 'Black Star Promos',
            pokoin_price: '$9.99',
        }),
        '129 · Black Star Promos · $9.99'
    );
    assert.equal(
        processor.compactCandidateMeta({
            collector_number: '232/091',
            expansion_name_en: 'Paldean Fates',
        }),
        '232 · Paldean Fates'
    );
});

test('Vinted main Pokoin button opens side panel from shadow overlay', async () => {
    const messages = [];
    const details = createDomElement('section');
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            location: {
                href: 'https://www.vinted.it/items/40-dragonite',
                hostname: 'www.vinted.it',
                pathname: '/items/40-dragonite',
            },
            extractTitleInfo: (title) => ({
                pokemonName: /dragonite/i.test(String(title || '')) ? 'Dragonite' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true };
                },
            },
        },
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            contains: (element) => details.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            body: details,
        },
    });
    const processor = new Processor();
    processor.currentTitle = 'Carta Pokemon Dragonite V';
    processor.currentKeywords = processor.extractVintedKeywords(
        processor.currentTitle,
        'Dragonite V Evolving Skies'
    );
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    processor.createVintedPanelButton();
    processor.attachVintedSidePanelClick(processor.currentButton);
    await processor.currentButton.eventListeners.click({
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
    });

    assert.equal(processor.currentPanelHost.shadowRoot.contains(processor.currentButton), true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].action, 'openSidePanelForCurrentTab');
    assert.equal(messages[0].url, 'https://www.vinted.it/items/40-dragonite');
    assert.ok(messages[0].primaryClues.some((clue) => /^dragonite v$/i.test(clue)));
    assert.ok(messages[0].primaryClues.some((clue) => /^v$/i.test(clue)));

    await processor.currentButton.eventListeners.click({
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
    });
    assert.equal(messages.length, 2, 'idempotent listener attachment should not duplicate one click');
});

test('eBay Pokoin button stays compact blue and never uses old green matched state', () => {
    const icon = { style: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    const button = createButtonStub();
    button.querySelector = (selector) => selector === 'img' ? icon : null;
    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor');
    const processor = new Processor();

    processor.setPokoinButtonLabel(button, 3);
    processor.applyPokoinButtonStyles(button);

    assert.equal(button.style.background, '#0ea5e9');
    assert.equal(button.style.borderRadius, '999px');
    assert.equal(button.style.width, 'auto');
    assert.equal(button.style.maxWidth, 'max-content');
    assert.equal(button.style.flex, '0 0 auto');
    assert.notEqual(button.style.background, '#28a745');
    assert.doesNotMatch(button.innerHTML, /#28a745|#218838|#6c757d/);
    assert.equal(icon.style.width, '20px');
    assert.equal(icon.style.height, '20px');
    assert.equal(icon.style.maxWidth, '20px');
    assert.equal(icon.style.flex, '0 0 20px');
    assert.equal(icon.attributes['data-pokoin-button-icon'], 'true');
});

test('eBay Magearna EX title builds Vinted-like structured payload and clues', () => {
    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: {
            location: {
                href: 'https://www.ebay.com/itm/12345?hash=abc',
                hostname: 'www.ebay.com',
                pathname: '/itm/12345',
            },
            extractTitleInfo: () => ({
                pokemonName: 'Magearna',
                collectorNumber: '110/114',
                isEXCard: true,
                expansion: 'Steam Siege',
            }),
        },
    });
    const processor = new Processor();

    const payload = processor.buildEbayPayload('Magearna EX - 110/114 - Pokemon Steam...', processor.extractTitleInfo('Magearna EX - 110/114 - Pokemon Steam...'));

    assert.equal(payload.source, 'ebay');
    assert.equal(payload.name, 'Magearna');
    assert.equal(payload.variation, 'ex');
    assert.equal(payload.collectorNumber, '110/114');
    assert.equal(payload.numericCollectorNumber, '110');
    assert.equal(payload.expansion, 'Steam Siege');
    assert.equal(payload.searchTitle, 'Magearna ex Steam Siege 110/114');
    assert.deepEqual(Array.from(payload.primaryClues), ['Magearna', 'ex']);
    assert.ok(payload.selectedClues.includes('110/114'));
    assert.ok(payload.selectedClues.includes('Steam Siege'));
    assert.match(processor.buildEbaySearchSignature(payload), /magearnaexsteamsiege110114/);
});

test('eBay overlay selected keys preserve RC collector and Radiant Collection evidence', async () => {
    const messages = [];
    const page = createDomElement('div');
    const titleElement = createDomElement('h1', { 'data-testid': 'x-item-title__mainTitle' });
    titleElement.textContent = 'Sylveon EX RC32/RC32 Generations Ultra Rare Full Art Holo 170HP TCG NM/LP';
    page.appendChild(titleElement);

    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: {
            location: {
                href: 'https://www.ebay.com/itm/rc32-sylveon?hash=abc',
                hostname: 'www.ebay.com',
                pathname: '/itm/rc32-sylveon',
            },
            extractTitleInfo: (title) => ({
                pokemonName: /sylveon/i.test(String(title || '')) ? 'Sylveon' : null,
                isEXCard: /\bex\b/i.test(String(title || '')),
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    if (message.action === 'searchCardForTitle') {
                        return {
                            success: true,
                            results: [
                                { blueprint_id: 'sylveon-rc32', name_en: 'Sylveon EX', expansion_name_en: 'Generations Radiant Collection', collector_number: 'RC32/RC32', search_score: 95 },
                            ],
                        };
                    }
                    return { success: true };
                },
            },
        },
        document: {
            title: titleElement.textContent,
            querySelector: (selector) => {
                if (selector.includes('h1') || selector.includes('x-item-title')) return titleElement;
                if (selector === '[data-pokoin-ebay-panel-host]') return page.querySelector(selector);
                return null;
            },
            querySelectorAll: (selector) => {
                if (selector.includes('h1') || selector.includes('x-item-title')) return [titleElement];
                if (selector === '[data-pokoin-ebay-panel-host]') return page.querySelectorAll(selector);
                return [];
            },
            contains: (element) => page.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            body: page,
        },
    });
    const processor = new Processor();
    processor.processProductPage();
    await Promise.resolve();

    const searchMessage = messages.find((message) => message.action === 'searchCardForTitle');
    const host = page.querySelector('[data-pokoin-ebay-panel-host]');
    const panel = host.shadowRoot.querySelector('[data-pokoin-ebay-panel]');
    const selectedLabels = processor.selectedKeywordLabels();

    assert.ok(host, 'eBay overlay host should render');
    assert.equal(host.style.position, 'fixed');
    assert.equal(host.style.left, '12px');
    assert.equal(host.style.top, '12px');
    assert.equal(host.style.bottom, 'auto');
    assert.equal(host.style.maxHeight, 'calc(100vh - 24px)');
    assert.equal(host.style.pointerEvents, 'none');
    assert.ok(panel.querySelectorAll('[data-pokoin-ebay-keyword]').length > 0, 'eBay key chips should render');
    assert.ok(selectedLabels.includes('Sylveon'), 'Pokemon name key should be selected');
    assert.ok(selectedLabels.includes('ex'), 'explicit variation key should be selected');
    assert.ok(selectedLabels.includes('RC32/RC32'), 'prefixed slash collector should stay atomic');
    assert.ok(selectedLabels.includes('Generations Radiant Collection'), 'RC collector should add Radiant Collection context');
    assert.equal(searchMessage.ebayPayload.name, 'Sylveon');
    assert.equal(searchMessage.ebayPayload.variation, 'ex');
    assert.equal(searchMessage.ebayPayload.collectorNumber, 'RC32/RC32');
    assert.equal(searchMessage.ebayPayload.expansion, 'Generations Radiant Collection');
    assert.equal(searchMessage.title, 'Sylveon ex Generations Radiant Collection RC32/RC32');
});

test('eBay localized Sandstorm title prioritizes collector and expansion over broad ex', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: {
            location: { href: 'https://www.ebay.it/itm/zangoose-14', hostname: 'www.ebay.it', pathname: '/itm/zangoose-14' },
            extractTitleInfo: (title) => ({
                pokemonName: /zangoose/i.test(String(title || '')) ? 'Zangoose' : null,
                isEXCard: /\bex\b/i.test(String(title || '')),
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();
    const title = 'Carta Pokemon Zangoose 14/100 EX Tempesta di Sabbia Holo Rara LP/NM 2003 TCG';
    processor.currentTitle = title;
    processor.currentKeywords = processor.extractEbayKeywords(title, '', processor.extractTitleInfo(title));
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.searchCardWithBackground(title);

    const selectedLabels = processor.selectedKeywordLabels();
    const payload = messages[0].ebayPayload;
    assert.ok(selectedLabels.includes('Zangoose'), 'Pokemon name should be selected');
    assert.ok(selectedLabels.includes('14/100'), 'slash collector should be selected');
    assert.ok(selectedLabels.includes('EX Sandstorm'), 'Italian expansion alias should be selected');
    assert.equal(selectedLabels.includes('ex'), false, 'EX inside EX Sandstorm should not become a broad variation');
    assert.equal(payload.name, 'Zangoose');
    assert.equal(payload.collectorNumber, '14/100');
    assert.equal(payload.numericCollectorNumber, '14');
    assert.equal(payload.expansion, 'EX Sandstorm');
    assert.equal(payload.variation, '');
    assert.equal(messages[0].title, 'Zangoose EX Sandstorm 14/100');
});

test('eBay overlay chip toggles invalidate stale rows and send selected-key payload', async () => {
    const messages = [];
    let resolveFirst;
    const firstSearch = new Promise((resolve) => {
        resolveFirst = resolve;
    });
    let searchCount = 0;
    const page = createDomElement('div');
    const titleElement = createDomElement('h1', { 'data-testid': 'x-item-title__mainTitle' });
    titleElement.textContent = 'Zangoose 14/100 EX Team Magma vs Aqua Pokemon TCG';
    page.appendChild(titleElement);

    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: {
            location: { href: 'https://www.ebay.com/itm/zangoose-14', hostname: 'www.ebay.com', pathname: '/itm/zangoose-14' },
            extractTitleInfo: (title) => ({
                pokemonName: /zangoose/i.test(String(title || '')) ? 'Zangoose' : null,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    if (message.action !== 'searchCardForTitle') return { success: true };
                    searchCount += 1;
                    if (searchCount === 1) return firstSearch;
                    return { success: true, results: [{ blueprint_id: 'zangoose-14', name_en: 'Zangoose', expansion_name_en: 'EX Team Magma vs Aqua', collector_number: '14/100', search_score: 95 }] };
                },
            },
        },
        document: {
            title: titleElement.textContent,
            querySelector: (selector) => {
                if (selector.includes('h1') || selector.includes('x-item-title')) return titleElement;
                if (selector === '[data-pokoin-ebay-panel-host]') return page.querySelector(selector);
                return null;
            },
            querySelectorAll: (selector) => {
                if (selector.includes('h1') || selector.includes('x-item-title')) return [titleElement];
                if (selector === '[data-pokoin-ebay-panel-host]') return page.querySelectorAll(selector);
                return [];
            },
            contains: (element) => page.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            body: page,
        },
    });
    const processor = new Processor();
    processor.processProductPage();

    const manualChip = processor.currentPanel.querySelectorAll('[data-pokoin-ebay-keyword]')
        .find((chip) => chip.attributes['aria-pressed'] === 'false');
    assert.ok(manualChip, 'manual eBay key chip should be available to toggle');
    manualChip.eventListeners.click({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
    await Promise.resolve();
    resolveFirst({ success: true, results: [{ blueprint_id: 'stale-zangoose', name_en: 'Zangoose', collector_number: '15/100', search_score: 99 }] });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(processor.lastRenderedPreviewResults[0]?.blueprint_id, 'zangoose-14');
    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 2);
    assert.equal(messages[1].selectionRevision, 1);
    assert.ok(messages[1].ebayPayload.selectedClues.length > messages[0].ebayPayload.selectedClues.length);
});

test('eBay manual clue input adds selected clue and invalidates stale rows', async () => {
    const messages = [];
    const page = createDomElement('div');
    const titleElement = createDomElement('h1', { 'data-testid': 'x-item-title__mainTitle' });
    titleElement.textContent = 'Zangoose ex Pokemon TCG';
    page.appendChild(titleElement);
    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: {
            location: { href: 'https://www.ebay.com/itm/zangoose-manual', hostname: 'www.ebay.com', pathname: '/itm/zangoose-manual' },
            extractTitleInfo: (title) => ({
                pokemonName: /zangoose/i.test(String(title || '')) ? 'Zangoose' : null,
                isEXCard: /\bex\b/i.test(String(title || '')),
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    if (message.action !== 'searchCardForTitle') return { success: true };
                    return { success: true, results: [{ blueprint_id: 'zangoose-14', name_en: 'Zangoose ex', collector_number: '14/100', search_score: 95 }] };
                },
            },
        },
        document: {
            title: titleElement.textContent,
            querySelector: (selector) => {
                if (selector.includes('h1') || selector.includes('x-item-title')) return titleElement;
                if (selector === '[data-pokoin-ebay-panel-host]') return page.querySelector(selector);
                return null;
            },
            querySelectorAll: (selector) => {
                if (selector.includes('h1') || selector.includes('x-item-title')) return [titleElement];
                if (selector === '[data-pokoin-ebay-panel-host]') return page.querySelectorAll(selector);
                return [];
            },
            contains: (element) => page.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            body: page,
        },
    });
    const processor = new Processor();
    processor.processProductPage();
    await Promise.resolve();
    processor.searchResultsBySignature.set(processor.buildEbaySearchSignature(processor.buildSelectedEbayPayload(processor.currentTitle)), [
        { blueprint_id: 'stale-ebay', name_en: 'Zangoose ex', collector_number: '15/100' },
    ]);
    processor.lastRenderedPreviewResults = [{ blueprint_id: 'stale-ebay', name_en: 'Zangoose ex', collector_number: '15/100' }];

    const input = processor.currentPanel.querySelector('[data-pokoin-ebay-manual-clue-input]');
    assert.ok(input, 'manual clue input should render in eBay overlay');
    input.value = '14/100';
    input.eventListeners.keydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
    await Promise.resolve();
    await Promise.resolve();

    const selectedClues = processor.selectedKeywordLabels();
    const searchMessages = messages.filter((message) => message.action === 'searchCardForTitle');
    assert.ok(selectedClues.includes('14/100'));
    assert.equal(selectedClues.filter((clue) => clue === '14/100').length, 1);
    assert.equal(searchMessages.at(-1).ebayPayload.collectorNumber, '14/100');
    assert.ok(searchMessages.at(-1).selectedClues.includes('14/100'));
    assert.equal(searchMessages.at(-1).selectionRevision, 1);
    assert.equal(processor.lastRenderedPreviewResults.length, 0, 'manual eBay clue should clear stale rows before the refreshed search paints');

    input.value = '14/100';
    input.eventListeners.keydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
    assert.equal(processor.selectedKeywordLabels().filter((clue) => clue === '14/100').length, 1);
});

test('eBay item page retries overlay injection after late title hydration', async () => {
    const page = createDomElement('div');
    const titleElement = createDomElement('h1', { 'data-testid': 'x-item-title__mainTitle' });
    titleElement.textContent = 'Zangoose 14/100 EX Tempesta di Sabbia';
    const timers = [];
    const observers = [];
    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: {
            location: { href: 'https://www.ebay.it/itm/zangoose-14', hostname: 'www.ebay.it', pathname: '/itm/zangoose-14' },
            extractTitleInfo: (title) => ({
                pokemonName: /zangoose/i.test(String(title || '')) ? 'Zangoose' : null,
            }),
        },
        document: {
            title: '',
            querySelector: (selector) => {
                if (selector === '[data-pokoin-ebay-panel-host]') return page.querySelector(selector);
                return page.querySelector(selector);
            },
            querySelectorAll: (selector) => {
                if (selector === '[data-pokoin-ebay-panel-host]') return page.querySelectorAll(selector);
                return page.querySelectorAll(selector);
            },
            contains: (element) => page.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            body: page,
        },
        MutationObserver: class {
            constructor(callback) {
                this.callback = callback;
                observers.push(this);
            }
            observe() {}
        },
        setTimeout: (callback) => {
            timers.push(callback);
            return callback;
        },
        clearTimeout: () => {},
    });
    const processor = new Processor();

    processor.init();
    assert.equal(page.querySelector('[data-pokoin-ebay-panel-host]'), null);

    page.appendChild(titleElement);
    observers[0].callback([{ type: 'childList', addedNodes: [titleElement] }]);
    assert.equal(timers.length, 1);
    timers[0]();
    await Promise.resolve();

    assert.ok(page.querySelector('[data-pokoin-ebay-panel-host]'), 'late eBay title should still get the overlay');
    assert.ok(processor.selectedKeywordLabels().includes('14/100'));
});

test('eBay button sends same structured payload and preview rows to side panel', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: {
            location: {
                href: 'https://www.ebay.com/itm/12345?hash=abc',
                hostname: 'www.ebay.com',
                pathname: '/itm/12345',
            },
            extractTitleInfo: () => ({
                pokemonName: 'Magearna',
                collectorNumber: '110/114',
                isEXCard: true,
                expansion: 'Steam Siege',
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true };
                },
            },
        },
    });
    const processor = new Processor();
    const title = 'Magearna EX - 110/114 - Pokemon Steam...';
    const payload = processor.buildEbayPayload(title, processor.extractTitleInfo(title));
    processor.storeMatchedResults('https://www.ebay.com/itm/12345', title, [
        { blueprint_id: 'steam-110', name_en: 'Magearna EX', expansion_name_en: 'Steam Siege', collector_number: '110/114', search_score: 90 },
        { blueprint_id: 'generic', name_en: 'Magearna ex', expansion_name_en: 'Mega Evolution', collector_number: '001', search_score: 100 },
    ]);
    const button = createDomElement('button');
    processor.attachSidePanelClick(button, title, 'https://www.ebay.com/itm/12345?hash=abc', payload);

    await button.eventListeners.click({
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
    });

    const message = messages.at(-1);
    assert.equal(message.action, 'openSidePanelForCurrentTab');
    assert.equal(message.previewSource, 'ebay_button_preview');
    assert.equal(message.title, 'Magearna ex Steam Siege 110/114');
    assert.deepEqual(Array.from(message.previewRows.map((row) => row.card_id)), ['steam-110', 'generic']);
    assert.deepEqual(Array.from(message.previewRows.map((row) => row.set_name)), ['Steam Siege', 'Mega Evolution']);
    assert.equal(message.ebayPayload.name, 'Magearna');
    assert.equal(message.ebayPayload.variation, 'ex');
    assert.equal(message.ebayPayload.collectorNumber, '110/114');
    assert.equal(message.ebayPayload.expansion, 'Steam Siege');
    assert.deepEqual(message.marketplacePayload, message.ebayPayload);
});

test('eBay repeated same item and selected clues reuse overlay preview cache', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: {
            location: {
                href: 'https://www.ebay.com/itm/100-ultra-necrozma?hash=a',
                hostname: 'www.ebay.com',
                pathname: '/itm/100-ultra-necrozma',
            },
            extractTitleInfo: () => ({
                pokemonName: 'Ultra Necrozma',
                isGXCard: true,
                collectorNumber: '95/131',
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    if (message.action === 'searchCardForTitle') {
                        return {
                            success: true,
                            results: [
                                { blueprint_id: 'ultra-necrozma-gx-95', name_en: 'Ultra Necrozma GX', collector_number: '95/131', search_score: 96 },
                            ],
                        };
                    }
                    return { success: true };
                },
            },
        },
    });
    const processor = new Processor();
    const title = 'Ultra Necrozma GX 95/131 Pokemon TCG';
    processor.currentTitle = title;
    processor.currentKeywords = processor.extractEbayKeywords(title, '', processor.extractTitleInfo(title));
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.runEbaySearch(title, 'first-visit');
    await Promise.resolve();
    await processor.runEbaySearch(title, 'tab-revisit');
    await Promise.resolve();

    const searchMessages = messages.filter((message) => message.action === 'searchCardForTitle');
    const previewMessages = messages.filter((message) => message.action === 'marketplacePreviewReady');
    assert.equal(searchMessages.length, 1, 'same eBay URL and selected clues should not search twice');
    assert.equal(previewMessages.length, 1, 'same eBay preview rows should not re-send preview-ready on revisit');
    assert.equal(previewMessages[0].source, 'ebay');
    assert.deepEqual(previewMessages[0].previewRows.map((row) => row.card_id), ['ultra-necrozma-gx-95']);
});

test('eBay changed manual clue invalidates overlay preview cache', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: {
            location: {
                href: 'https://www.ebay.com/itm/101-magearna?hash=a',
                hostname: 'www.ebay.com',
                pathname: '/itm/101-magearna',
            },
            extractTitleInfo: () => ({
                pokemonName: 'Magearna',
                isEXCard: true,
            }),
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    if (message.action === 'searchCardForTitle') {
                        const manualCollector = message.selectedClues?.includes('110/114');
                        return {
                            success: true,
                            results: [
                                {
                                    blueprint_id: manualCollector ? 'magearna-ex-110' : 'magearna-generic',
                                    name_en: 'Magearna EX',
                                    collector_number: manualCollector ? '110/114' : '',
                                    search_score: 95,
                                },
                            ],
                        };
                    }
                    return { success: true };
                },
            },
        },
    });
    const processor = new Processor();
    const title = 'Magearna EX Pokemon TCG';
    processor.currentTitle = title;
    processor.currentKeywords = processor.extractEbayKeywords(title, '', processor.extractTitleInfo(title));
    processor.selectedKeywordValues = new Set(
        processor.currentKeywords
            .filter((keyword) => keyword.selectedByDefault)
            .map((keyword) => keyword.compact)
    );

    await processor.runEbaySearch(title, 'first-visit');
    processor.addManualEbayKeyword('110/114');
    processor.invalidateEbayPreviewForSelectionChange();
    await processor.runEbaySearch(title, 'manual-clue');

    const searchMessages = messages.filter((message) => message.action === 'searchCardForTitle');
    const previewMessages = messages.filter((message) => message.action === 'marketplacePreviewReady');
    assert.equal(searchMessages.length, 2, 'changed eBay selected clue should search again');
    assert.equal(previewMessages.length, 2, 'changed eBay selected clue should publish a new canonical preview');
    assert.equal(searchMessages.at(-1).ebayPayload.collectorNumber, '110/114');
    assert.deepEqual(previewMessages.at(-1).previewRows.map((row) => row.card_id), ['magearna-ex-110']);
});

test('background eBay canonical preview cache is isolated by item URL', async () => {
    const storage = {};
    const storageWrites = [];
    const { sendMessage } = loadBackgroundMessageHarness({
        storage,
        tabs: {
            get: async (tabId) => ({
                id: tabId,
                title: tabId === 10 ? 'Magearna EX' : 'Ultra Necrozma GX',
                url: tabId === 10
                    ? 'https://www.ebay.com/itm/10-magearna'
                    : 'https://www.ebay.com/itm/11-ultra-necrozma',
            }),
        },
        sessionStorage: {
            set: async (payload) => {
                Object.assign(storage, payload);
                if (payload.sidePanelState) {
                    storageWrites.push(payload.sidePanelState);
                }
            },
        },
    });
    const magearnaPayload = {
        source: 'ebay',
        listingKey: 'https://www.ebay.com/itm/10-magearna',
        originalTitle: 'Magearna EX',
        searchTitle: 'Magearna ex',
        name: 'Magearna',
        variation: 'ex',
        selectedClues: ['Magearna', 'ex'],
        primaryClues: ['Magearna', 'ex'],
    };
    const ultraPayload = {
        source: 'ebay',
        listingKey: 'https://www.ebay.com/itm/11-ultra-necrozma',
        originalTitle: 'Ultra Necrozma GX',
        searchTitle: 'Ultra Necrozma GX',
        name: 'Ultra Necrozma',
        variation: 'GX',
        selectedClues: ['Ultra Necrozma', 'GX'],
        primaryClues: ['Ultra Necrozma', 'GX'],
    };

    await sendMessage({
        action: 'marketplacePreviewReady',
        source: 'ebay',
        url: magearnaPayload.listingKey,
        title: magearnaPayload.searchTitle,
        originalTitle: magearnaPayload.originalTitle,
        selectedClues: magearnaPayload.selectedClues,
        primaryClues: magearnaPayload.primaryClues,
        previewSignature: 'ebay|magearna|10',
        selectionRevision: 0,
        ebayPayload: magearnaPayload,
        marketplacePayload: magearnaPayload,
        previewRows: [{ card_id: 'magearna-ex-110', name: 'Magearna EX' }],
    }, { tab: { id: 10, title: 'Magearna EX', url: magearnaPayload.listingKey } });
    await sendMessage({
        action: 'marketplacePreviewReady',
        source: 'ebay',
        url: ultraPayload.listingKey,
        title: ultraPayload.searchTitle,
        originalTitle: ultraPayload.originalTitle,
        selectedClues: ultraPayload.selectedClues,
        primaryClues: ultraPayload.primaryClues,
        previewSignature: 'ebay|ultra-necrozma|11',
        selectionRevision: 0,
        ebayPayload: ultraPayload,
        marketplacePayload: ultraPayload,
        previewRows: [{ card_id: 'ultra-necrozma-gx-95', name: 'Ultra Necrozma GX' }],
    }, { tab: { id: 11, title: 'Ultra Necrozma GX', url: ultraPayload.listingKey } });
    await sendMessage({
        action: 'openSidePanelForCurrentTab',
        url: magearnaPayload.listingKey,
        title: magearnaPayload.searchTitle,
        originalTitle: magearnaPayload.originalTitle,
        selectedClues: magearnaPayload.selectedClues,
        primaryClues: magearnaPayload.primaryClues,
        previewSignature: 'ebay|magearna|10',
        ebayPayload: magearnaPayload,
        marketplacePayload: magearnaPayload,
    }, { tab: { id: 10, title: 'Magearna EX', url: magearnaPayload.listingKey } });

    const latestState = storageWrites.at(-1);
    assert.equal(latestState.pageInfo.url, magearnaPayload.listingKey);
    assert.deepEqual(latestState.rows.map((row) => row.card_id), ['magearna-ex-110']);
    assert.doesNotMatch(JSON.stringify(latestState), /ultra-necrozma/i);
});

test('Cardmarket green button keeps compact icon dimensions after relabel', () => {
    const icon = { style: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    const button = createButtonStub();
    button.querySelector = (selector) => selector === 'img' ? icon : null;
    const { Processor } = loadProcessor('processors/CME.js', 'CardmarketProcessor');
    const processor = new Processor();

    processor.setPokoinButtonLabel(button, 3);

    assert.equal(button.style.display, 'inline-flex');
    assert.equal(button.style.width, 'auto');
    assert.equal(button.style.maxWidth, 'max-content');
    assert.equal(button.style.flex, '0 0 auto');
    assert.equal(icon.style.width, '20px');
    assert.equal(icon.style.height, '20px');
    assert.equal(icon.style.maxWidth, '20px');
    assert.equal(icon.style.flex, '0 0 20px');
    assert.equal(icon.attributes['data-pokoin-button-icon'], 'true');
});

test('shared marketplace Pokoin button icons are size-contained', () => {
    [
        ['processors/EBAYE.js', 'EbayProcessor', '20px'],
        ['processors/CME.js', 'CardmarketProcessor', '20px'],
    ].forEach(([relativePath, className, expectedSize]) => {
        const { Processor } = loadProcessor(relativePath, className);
        const processor = new Processor();
        const button = createButtonStub();
        const icon = {
            style: {},
            attributes: {},
            setAttribute(name, value) {
                this.attributes[name] = value;
            },
        };
        button.querySelector = (selector) => (selector === 'img' ? icon : null);

        processor.applyPokoinButtonStyles(button);

        assert.equal(icon.attributes['data-pokoin-button-icon'], 'true', `${relativePath} should mark Pokoin icon`);
        assert.equal(icon.style.width, expectedSize);
        assert.equal(icon.style.height, expectedSize);
        assert.equal(icon.style.minWidth, expectedSize);
        assert.equal(icon.style.maxWidth, expectedSize);
        assert.equal(icon.style.flex, `0 0 ${expectedSize}`);
        assert.equal(icon.style.objectFit, 'cover');
    });
});

test('Cardmarket matched button remains visually distinct after relabel', () => {
    const button = createButtonStub();
    const { Processor } = loadProcessor('processors/CME.js', 'CardmarketProcessor');
    const processor = new Processor();

    processor.applyPokoinButtonState(button, 'loading');
    const loadingBackground = button.style.background;
    processor.applyPokoinButtonState(button, 'matched', 2);

    assert.equal(loadingBackground, '#6c757d');
    assert.equal(button.style.background, '#0ea5e9');
    assert.equal(button.style.border, '1px solid #38bdf8');
    assert.match(button.style.boxShadow, /14, 165, 233/);
});

function createCardmarketFixture({ includeDetails = true, includeButton = false } = {}) {
    const main = createDomElement('main', { class: 'container' });
    const mainContent = createDomElement('div', { id: 'mainContent' });
    const titleContainer = createDomElement('div', { class: 'page-title-container' });
    const h1 = createDomElement('h1');
    h1.textContent = 'Piplup (MEP 042)';
    const actionArea = createDomElement('div', { class: 'ms-auto' });
    titleContainer.appendChild(h1);
    titleContainer.appendChild(actionArea);
    mainContent.appendChild(titleContainer);

    const section = createDomElement('section', { id: 'tabs' });
    const dl = createDomElement('dl', { class: 'labeled' });
    if (includeDetails) {
        [
            ['Numero', '042'],
            ['Stampata in', 'MEP Black Star Promos'],
            ['Specie', 'Piplup'],
        ].forEach(([label, value]) => {
            const dt = createDomElement('dt');
            dt.textContent = label;
            const dd = createDomElement('dd');
            dd.textContent = value;
            dt.nextElementSibling = dd;
            dl.appendChild(dt);
            dl.appendChild(dd);
        });
    }
    section.appendChild(dl);
    mainContent.appendChild(section);

    const articleRow = createDomElement('div', { class: 'article-row' });
    articleRow.textContent = 'Red Card 012 HMD comment filter seller';
    mainContent.appendChild(articleRow);
    main.appendChild(mainContent);

    if (includeButton) {
        const existingButton = createDomElement('button', { 'data-pokemon-linker-button': 'true' });
        existingButton.textContent = 'Pokoin.com (1)';
        actionArea.appendChild(existingButton);
    }

    return {
        main,
        mainContent,
        titleContainer,
        h1,
        actionArea,
        dl,
        articleRow,
        querySelector(selector) {
            if (selector === 'main.container #mainContent' || selector === '#mainContent') return mainContent;
            if (selector === 'main.container' || selector === 'main') return main;
            if (selector === '.page-title-container h1') return h1;
            if (selector === '[data-pokemon-linker-button="true"]') return main.querySelector('[data-pokemon-linker-button]');
            return main.querySelector(selector);
        },
        querySelectorAll(selector) {
            if (selector === 'dl.labeled dt, dl.labeled th, dt, th') {
                return includeDetails ? dl.children.filter((child) => child.tagName === 'DT') : [];
            }
            return main.querySelectorAll(selector);
        },
        createElement: (tagName) => createDomElement(tagName),
        body: main,
        contains: (element) => main.contains(element),
        title: 'Piplup (MEP 042) | Cardmarket',
    };
}

test('Cardmarket product injection waits for title and labeled identity details', async () => {
    const messages = [];
    const { Processor, sandbox } = loadProcessor('processors/CME.js', 'CardmarketProcessor', {
        window: {
            location: {
                href: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
                hostname: 'www.cardmarket.com',
                pathname: '/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
            },
            extractTitleInfo: (title) => ({ pokemonName: /Piplup/i.test(title) ? 'Piplup' : null }),
        },
        document: createCardmarketFixture({ includeDetails: false }),
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
        setTimeout: (fn) => {
            sandbox.pendingRetry = fn;
            return 1;
        },
        clearTimeout() {},
    });
    const processor = new Processor();

    processor.processProductPage();
    assert.equal(messages.length, 0);
    assert.equal(sandbox.document.querySelector('[data-pokemon-linker-button="true"]'), null);

    sandbox.document = createCardmarketFixture({ includeDetails: true });
    processor.processProductPage();
    await Promise.resolve();

    assert.equal(messages.length, 1);
    assert.equal(messages[0].title, 'Piplup (MEP 042)');
    assert.ok(sandbox.document.querySelector('[data-pokemon-linker-button="true"]'));
});

test('Cardmarket product injection is once per stable ready product URL', async () => {
    const messages = [];
    const documentStub = createCardmarketFixture({ includeDetails: true });
    const { Processor } = loadProcessor('processors/CME.js', 'CardmarketProcessor', {
        window: {
            location: {
                href: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042?foo=1#seller',
                hostname: 'www.cardmarket.com',
                pathname: '/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
            },
            extractTitleInfo: () => ({ pokemonName: 'Piplup' }),
        },
        document: documentStub,
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [] };
                },
            },
        },
    });
    const processor = new Processor();

    processor.processProductPage();
    processor.processProductPage();
    await Promise.resolve();

    assert.equal(messages.length, 1);
    assert.equal(documentStub.actionArea.querySelectorAll('[data-pokemon-linker-button]').length, 1);
});

test('Cardmarket processor sends ready detail clues with product search and side-panel open', async () => {
    const messages = [];
    const documentStub = createCardmarketFixture({ includeDetails: true });
    const { Processor } = loadProcessor('processors/CME.js', 'CardmarketProcessor', {
        window: {
            location: {
                href: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
                hostname: 'www.cardmarket.com',
                pathname: '/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
            },
            extractTitleInfo: () => ({ pokemonName: 'Piplup' }),
        },
        document: documentStub,
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true, results: [{ name_en: 'Piplup', blueprint_id: 'mep-042' }] };
                },
            },
        },
    });
    const processor = new Processor();

    processor.processProductPage();
    await Promise.resolve();
    await processor.inFlightProductSearches.values().next().value;
    const button = documentStub.actionArea.querySelector('[data-pokemon-linker-button]');
    button.eventListeners.click({
        preventDefault() {},
        stopPropagation() {},
    });
    await Promise.resolve();

    const searchMessage = messages.find((message) => message.action === 'searchCardForTitle');
    const openMessage = messages.find((message) => message.action === 'openSidePanelForCurrentTab');
    assert.equal(searchMessage.title, 'Piplup (MEP 042)');
    assert.deepEqual([...searchMessage.clues], ['042', 'MEP Black Star Promos']);
    assert.equal(searchMessage.primaryClues, undefined);
    assert.equal(searchMessage.cardmarketReady, true);
    assert.deepEqual([...openMessage.clues], ['042', 'MEP Black Star Promos']);
    assert.equal(openMessage.title, 'Piplup (MEP 042)');
});

test('Cardmarket structured parser keeps card name ahead of expansion', () => {
    const source = readRepoFile('config/background.js');
    const cleanCardmarketText = extractFunctionSource(source, 'cleanCardmarketText');
    const isExpansionText = extractFunctionSource(source, 'isCardmarketExpansionText');
    const normalizeExpansionAlias = extractFunctionSource(source, 'normalizeExpansionAlias');
    const removeNoise = extractFunctionSource(source, 'removeMarketplaceSearchNoise');
    const scrapeStructured = extractFunctionSource(source, 'scrapeStructuredCardFields');
    const compact = extractFunctionSource(source, 'compactSearchValue');
    const buildQueries = extractFunctionSource(source, 'buildCardvaultQueries');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`${cleanCardmarketText}\n${isExpansionText}\n${normalizeExpansionAlias}\n${removeNoise}\n${scrapeStructured}\n${compact}\n${buildQueries}\nthis.scrapeStructuredCardFields = scrapeStructuredCardFields; this.buildCardvaultQueries = buildCardvaultQueries;`, sandbox);

    const structured = sandbox.scrapeStructuredCardFields(
        'Camerupt (ASC 028)',
        { expansion: 'Ascended Heroes' }
    );

    assert.equal(structured.name, 'Camerupt');
    assert.equal(structured.searchName, 'Camerupt');
    assert.equal(structured.collectorNumber, 'ASC 028');
    assert.equal(structured.numericCollectorNumber, '028');
    assert.equal(structured.expansion, 'Ascended Heroes');
    assert.deepEqual([...sandbox.buildCardvaultQueries(structured.name)], ['Camerupt']);
});

test('Cardmarket provided title HTML yields name, prefixed collector, and span expansion', () => {
    const h1 = createDomElement('h1');
    h1.textContent = 'Piplup (MEP 042)';
    const span = createDomElement('span', { class: 'h4 text-muted fst-italic fw-normal' });
    span.textContent = ' MEP Black Star Promos - Singles';
    h1.appendChild(span);
    const pokoinButton = createDomElement('button', { 'data-pokemon-linker-button': 'true' });
    pokoinButton.textContent = 'Pokoin.com (1)';
    h1.appendChild(pokoinButton);

    const sandbox = loadBackgroundHelpers([
        'scrapeCardmarketContext',
        'scrapeStructuredCardFields',
        'buildTitleWithRequestClues',
    ]);
    sandbox.document = {
        querySelector: (selector) => {
            return null;
        },
        querySelectorAll: (selector) => {
            if (selector.includes('h1 span') || selector.includes('h1 .text-muted')) {
                return [pokoinButton, span];
            }
            return [];
        },
        title: '',
    };
    sandbox.window = { location: { href: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042' } };

    const rawTitle = `${h1.textContent} ${span.textContent} ${pokoinButton.textContent}`;
    const context = sandbox.scrapeCardmarketContext(rawTitle);
    const structured = sandbox.scrapeStructuredCardFields(rawTitle, context);
    const queryTitle = sandbox.buildTitleWithRequestClues(structured.name, [
        structured.collectorNumber,
        structured.numericCollectorNumber,
        structured.expansion,
    ]);

    assert.equal(context.expansion, 'MEP Black Star Promos');
    assert.equal(structured.name, 'Piplup');
    assert.equal(structured.collectorNumber, 'MEP 042');
    assert.equal(structured.numericCollectorNumber, '042');
    assert.equal(structured.expansion, 'MEP Black Star Promos');
    assert.equal(structured.searchName, 'Piplup');
    assert.match(queryTitle, /Piplup/);
    assert.match(queryTitle, /MEP 042/);
    assert.match(queryTitle, /\b042\b/);
    assert.match(queryTitle, /MEP Black Star Promos/);
    assert.doesNotMatch(structured.rawTitle, /Pokoin\.com/);
});

test('Cardmarket Italian product DOM extracts exact Piplup title and ignores extension noise', async () => {
    const fixture = createCardmarketFixture({ includeDetails: true });
    const h1 = fixture.h1;
    const span = createDomElement('span', { class: 'h4 text-muted fst-italic fw-normal' });
    span.textContent = ' MEP Black Star Promos - Singles';
    h1.appendChild(span);
    const pokoinButton = createDomElement('button', { 'data-pokemon-linker-button': 'true' });
    pokoinButton.textContent = 'Pokoin.com (1) Red Card';
    h1.appendChild(pokoinButton);

    const redCardSidebar = createDomElement('div', { 'data-pokoin-extension-panel': 'true' });
    redCardSidebar.textContent = 'Red Card 012 HMD';
    const searchInput = createDomElement('input');
    searchInput.textContent = 'Red Card';
    const iframe = createDomElement('iframe');
    iframe.textContent = 'Japanese Red Card';

    const documentStub = {
        ...fixture,
        title: 'Piplup (MEP 042) | Cardmarket',
        readyState: 'complete',
        body: { innerText: 'Prodotti Piplup (MEP 042) Numero 042 Stampata in MEP Black Star Promos Specie Piplup Red Card' },
        querySelector: (selector) => {
            if (selector === 'main.container #mainContent' || selector === '#mainContent') return fixture.mainContent;
            if (selector === 'main.container' || selector === 'main') return fixture.main;
            if (selector === '.page-title-container h1' || selector === 'h1') return h1;
            if (selector === '.page-title-container h1 + div, .page-title-container .font-italic, .page-title-container em, .page-title-container small') return null;
            if (selector === 'meta[property="og:title"], meta[name="twitter:title"]') return null;
            return fixture.querySelector(selector);
        },
        querySelectorAll: (selector) => {
            if (selector === '.page-title-container h1') return [h1];
            if (selector === 'main h1') return [];
            if (selector === 'h1') return [h1];
            if (selector === '.page-title-container h1 span, h1 span.h4, h1 .text-muted') return [pokoinButton, span];
            if (selector === '.breadcrumb a, nav a') return [];
            if (selector.includes('[data-pokoin-extension-panel]')) return [redCardSidebar];
            if (selector === 'input') return [searchInput];
            if (selector === 'iframe') return [iframe];
            return fixture.querySelectorAll(selector);
        },
    };

    const sandbox = loadBackgroundHelpers(['extractTitleFromPage']);
    sandbox.window = {
        location: {
            hostname: 'www.cardmarket.com',
            href: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
        },
    };
    sandbox.document = documentStub;

    const pageInfo = await sandbox.extractTitleFromPage();

    assert.equal(pageInfo.title, 'Piplup (MEP 042)');
    assert.equal(pageInfo.structuredCard.name, 'Piplup');
    assert.equal(pageInfo.structuredCard.collectorNumber, 'MEP 042');
    assert.equal(pageInfo.structuredCard.numericCollectorNumber, '042');
    assert.equal(pageInfo.structuredCard.expansion, 'MEP Black Star Promos');
    assert.equal(pageInfo.debug.titleSource, 'cardmarket-page-title');
    assert.equal(pageInfo.debug.cardmarketContext.details.number, '042');
    assert.doesNotMatch(pageInfo.title, /Red Card|Pokoin|012|HMD/i);
});

test('Cardmarket structured parser keeps trainer composite card names', () => {
    const source = readRepoFile('config/background.js');
    const cleanCardmarketText = extractFunctionSource(source, 'cleanCardmarketText');
    const isExpansionText = extractFunctionSource(source, 'isCardmarketExpansionText');
    const normalizeExpansionAlias = extractFunctionSource(source, 'normalizeExpansionAlias');
    const removeNoise = extractFunctionSource(source, 'removeMarketplaceSearchNoise');
    const scrapeStructured = extractFunctionSource(source, 'scrapeStructuredCardFields');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`${cleanCardmarketText}\n${isExpansionText}\n${normalizeExpansionAlias}\n${removeNoise}\n${scrapeStructured}\nthis.scrapeStructuredCardFields = scrapeStructuredCardFields;`, sandbox);

    const structured = sandbox.scrapeStructuredCardFields('Arven\'s Mabosstiff ex (mC 484)');

    assert.equal(structured.name, 'Arven\'s Mabosstiff ex');
    assert.equal(structured.searchName, 'Arven\'s Mabosstiff ex');
    assert.equal(structured.collectorNumber, 'MC 484');
    assert.equal(structured.numericCollectorNumber, '484');
});

test('background parser maps fullart to illustration rarity', () => {
    const source = readRepoFile('config/background.js');
    const cleanCardmarketText = extractFunctionSource(source, 'cleanCardmarketText');
    const normalizeExpansionAlias = extractFunctionSource(source, 'normalizeExpansionAlias');
    const removeNoise = extractFunctionSource(source, 'removeMarketplaceSearchNoise');
    const scrapeStructured = extractFunctionSource(source, 'scrapeStructuredCardFields');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`${cleanCardmarketText}\n${normalizeExpansionAlias}\n${removeNoise}\n${scrapeStructured}\nthis.scrapeStructuredCardFields = scrapeStructuredCardFields;`, sandbox);

    const structured = sandbox.scrapeStructuredCardFields('Pokémon Froslass Fullart');

    assert.equal(structured.name, 'Froslass');
    assert.equal(structured.searchName, 'Froslass');
    assert.equal(structured.rarity, 'illustration');
});

test('background expands selected illustration rarity into backend aliases', () => {
    const sandbox = loadBackgroundHelpers([
        'normalizeMarketplacePayload',
        'buildStructuredFallbackQueries',
        'sortRowsForStructuredCard',
        'rarityMatchRank',
    ]);
    const marketplacePayload = sandbox.normalizeMarketplacePayload({
        source: 'vinted',
        name: 'Sprigatito',
        searchTitle: 'Sprigatito illustration',
        selectedClues: ['Sprigatito', 'illustration'],
        primaryClues: ['Sprigatito'],
        features: ['illustration'],
        rarity: 'illustration',
    });
    const structuredCard = marketplacePayload.structuredCard;
    const queries = sandbox.buildStructuredFallbackQueries(structuredCard, 'Sprigatito illustration');
    const rows = [
        { card_id: 'generic', name: 'Sprigatito', set_name: 'Scarlet Violet', card_number: '13/198', rarity: 'Common', search_rank: 999 },
        { card_id: 'illustration-rare', name: 'Sprigatito', set_name: 'Scarlet Violet', card_number: '196/198', rarity: 'Illustration Rare', search_rank: 20 },
        { card_id: 'special-illustration', name: 'Sprigatito', set_name: 'Promo', card_number: '204/191', rarity: 'Special Illustration Rare', search_rank: 10 },
    ];

    assert.deepEqual(Array.from(structuredCard.rarityAliases), ['Illustration Rare', 'Special Illustration Rare', 'full art', 'illustration']);
    assert.ok(queries.includes('Sprigatito Illustration Rare'));
    assert.ok(queries.includes('Sprigatito Special Illustration Rare'));
    assert.equal(sandbox.rarityMatchRank(rows[1], structuredCard), 0);
    assert.equal(sandbox.rarityMatchRank(rows[0], structuredCard), 9);
    assert.equal(sandbox.sortRowsForStructuredCard(rows, structuredCard)[0].card_id, 'illustration-rare');
    assert.equal(sandbox.sortRowsForStructuredCard(rows, structuredCard).at(-1).card_id, 'generic');
});

test('background keeps Base Set family above Expedition Base Set', () => {
    const source = readRepoFile('config/background.js');
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true, json: async () => ({}) }),
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.isAllowedBaseSetFamily = isAllowedBaseSetFamily; this.sortRowsForStructuredCard = sortRowsForStructuredCard;`, sandbox, { filename: 'config/background.js' });

    const rows = [
        { card_id: 'expedition', name: 'Mewtwo', set_name: 'Expedition Base Set', card_number: '056/165', search_rank: 9999 },
        { card_id: 'base', name: 'Mewtwo', set_name: 'Base Set', card_number: '10/102', search_rank: 10 },
        { card_id: 'shadowless', name: 'Mewtwo', set_name: 'Base Set Shadowless', card_number: '10/102', search_rank: 9 },
        { card_id: 'base-jp', name: 'Mewtwo', set_name: 'Base Expansion Pack', card_number: '086/128', search_rank: 8 },
    ];
    const sorted = sandbox.sortRowsForStructuredCard(rows, { name: 'Mewtwo', expansion: 'Base Set' });

    assert.equal(sandbox.isAllowedBaseSetFamily(rows[0]), false);
    assert.equal(sandbox.isAllowedBaseSetFamily(rows[1]), true);
    assert.equal(sorted.slice(0, 3).map((row) => row.card_id).join(','), 'base,shadowless,base-jp');
    assert.equal(sorted.at(-1).card_id, 'expedition');
});

test('background ranks exact collector and expansion above generic high-score rows', () => {
    const sandbox = loadBackgroundHelpers(['sortRowsForStructuredCard']);
    const rows = [
        { card_id: '151-179', name: 'Pikachu', set_name: 'Pokemon 151', card_number: '179/165', search_rank: 9999 },
        { card_id: 'evo-35', name: 'Pikachu', set_name: 'Evolutions', card_number: '35/108', search_rank: 10 },
        { card_id: 'evo-36', name: 'Pikachu', set_name: 'Evolutions', card_number: '36/108', search_rank: 500 },
    ];
    const sorted = sandbox.sortRowsForStructuredCard(rows, {
        name: 'Pikachu',
        expansion: 'Evolutions',
        collectorNumber: '35/108',
    });

    assert.equal(sorted[0].card_id, 'evo-35');
    assert.equal(sorted.at(-1).card_id, '151-179');
});

test('background ranks explicit V variation above ex rows', () => {
    const sandbox = loadBackgroundHelpers([
        'sortRowsForStructuredCard',
        'rowMatchesStructuredVariation',
    ]);
    const rows = [
        { card_id: 'magnezone-ex', name: 'Magnezone ex', set_name: 'Scarlet Violet', card_number: '065/198', search_rank: 9999 },
        { card_id: 'magnezone-v', name: 'Magnezone V', set_name: 'Lost Origin', card_number: '056/196', search_rank: 20 },
    ];
    const structuredCard = {
        name: 'Magnezone',
        variation: 'v',
        collectorNumber: '056/196',
    };
    const sorted = sandbox.sortRowsForStructuredCard(rows, structuredCard);

    assert.equal(sandbox.rowMatchesStructuredVariation(rows[0], structuredCard), false);
    assert.equal(sandbox.rowMatchesStructuredVariation(rows[1], structuredCard), true);
    assert.equal(sorted[0].card_id, 'magnezone-v');
    assert.equal(sorted.at(-1).card_id, 'magnezone-ex');
});

test('background rejects no-variation Pikachu rows for explicit VMAX collector request', () => {
    const sandbox = loadBackgroundHelpers([
        'sortRowsForStructuredCard',
        'filterStrongExactRows',
        'rowMatchesStructuredVariation',
        'shouldRunAutocompleteFallback',
        'hasGoodEnoughExactRows',
    ]);
    const structuredCard = {
        name: 'Pikachu',
        searchName: 'Pikachu VMAX',
        variation: 'VMAX',
        collectorNumber: '007/025',
        numericCollectorNumber: '007',
        rarity: 'illustration',
    };
    const rows = [
        { card_id: 'pitch-pikachu', name: "Pitch's Pikachu", set_name: 'XY Promos', card_number: '272709', search_rank: 999999 },
        { card_id: 'plain-pikachu-007', name: 'Pikachu', set_name: 'Some Set', card_number: '007/025', search_rank: 999998 },
        { card_id: 'flying-pikachu-vmax', name: 'Flying Pikachu VMAX', set_name: 'Celebrations', card_number: '007/025', search_rank: 10 },
    ];
    const acceptedRows = rows.filter((row) => sandbox.rowMatchesStructuredVariation(row, structuredCard));
    const sorted = sandbox.sortRowsForStructuredCard(rows, structuredCard);
    const exactRows = sandbox.filterStrongExactRows(sorted, structuredCard);

    assert.deepEqual(Array.from(acceptedRows.map((row) => row.card_id)), ['flying-pikachu-vmax']);
    assert.equal(sorted[0].card_id, 'flying-pikachu-vmax');
    assert.deepEqual(Array.from(exactRows.map((row) => row.card_id)), ['flying-pikachu-vmax']);
    assert.equal(sandbox.hasGoodEnoughExactRows(exactRows, structuredCard), true);
    assert.equal(sandbox.shouldRunAutocompleteFallback(exactRows, structuredCard), false);
});

test('background keeps Rocket Zapdos composite above generic and V variants', () => {
    const sandbox = loadBackgroundHelpers([
        'sortRowsForStructuredCard',
        'rowMatchesStructuredName',
        'rowMatchesStructuredVariation',
    ]);
    const structuredCard = {
        name: 'Rocket Zapdos',
        searchName: 'Rocket Zapdos',
        collectorNumber: '15/132',
        numericCollectorNumber: '15',
        variation: '',
        strictVariation: true,
    };
    const rows = [
        { card_id: 'galarian-zapdos-v', name: 'Galarian Zapdos V', set_name: 'Chilling Reign', card_number: '080/198', search_rank: 999999 },
        { card_id: 'zapdos-base', name: 'Zapdos', set_name: 'Base Set', card_number: '15/102', search_rank: 999998 },
        { card_id: 'rocket-zapdos-15', name: 'Rocket Zapdos', set_name: 'Gym Challenge', card_number: '15/132', search_rank: 50 },
    ];
    const acceptedRows = rows
        .filter((row) => sandbox.rowMatchesStructuredName(row, structuredCard))
        .filter((row) => sandbox.rowMatchesStructuredVariation(row, structuredCard));
    const sorted = sandbox.sortRowsForStructuredCard(acceptedRows, structuredCard);

    assert.deepEqual(acceptedRows.map((row) => row.card_id), ['rocket-zapdos-15']);
    assert.equal(sorted[0].card_id, 'rocket-zapdos-15');
});

test('background refuses shorter resolved species for Rocket Zapdos request', () => {
    const sandbox = loadBackgroundHelpers(['shouldUseResolvedCardName']);

    assert.equal(
        sandbox.shouldUseResolvedCardName('Zapdos', { name: 'Rocket Zapdos', searchName: 'Rocket Zapdos', collectorNumber: '15/132' }),
        false
    );
    assert.equal(
        sandbox.shouldUseResolvedCardName('Rocket Zapdos', { name: 'Rocket Zapdos', searchName: 'Rocket Zapdos', collectorNumber: '15/132' }),
        true
    );
});

test('background ranks Magearna EX 110/114 Steam Siege above generic Magearna ex rows', () => {
    const sandbox = loadBackgroundHelpers(['sortRowsForStructuredCard']);
    const rows = [
        { card_id: 'generic-mega', name: 'Magearna ex', set_name: 'Mega Evolution', card_number: '001/132', search_rank: 12000 },
        { card_id: 'steam-110', name: 'Magearna EX', set_name: 'Steam Siege', card_number: '110/114', search_rank: 10 },
        { card_id: 'steam-other', name: 'Magearna EX', set_name: 'Steam Siege', card_number: '111/114', search_rank: 1000 },
    ];
    const sorted = sandbox.sortRowsForStructuredCard(rows, {
        name: 'Magearna',
        searchName: 'Magearna ex',
        variation: 'ex',
        collectorNumber: '110/114',
        numericCollectorNumber: '110',
        expansion: 'Steam Siege',
    });

    assert.equal(sorted[0].card_id, 'steam-110');
    assert.equal(sorted.at(-1).card_id, 'generic-mega');
});

test('background ranks eBay RC32 Radiant Collection above generic Sylveon ex rows', () => {
    const sandbox = loadBackgroundHelpers(['sortRowsForStructuredCard', 'collectorNumberMatchRank', 'expansionMatches']);
    const rows = [
        { card_id: 'generic-156', name: 'Sylveon ex', set_name: 'Prismatic Evolutions', card_number: '156/131', search_rank: 12000 },
        { card_id: 'tfe-212', name: 'Sylveon ex', set_name: 'Twilight Masquerade', card_number: '212/167', search_rank: 11000 },
        { card_id: 'rc32', name: 'Sylveon EX', set_name: 'Generations Radiant Collection', card_number: 'RC32/RC32', search_rank: 10 },
        { card_id: 'bare-32', name: 'Sylveon EX', set_name: 'Generations', card_number: '32/83', search_rank: 9000 },
    ];
    const sorted = sandbox.sortRowsForStructuredCard(rows, {
        name: 'Sylveon',
        searchName: 'Sylveon ex',
        variation: 'ex',
        collectorNumber: 'RC32/RC32',
        numericCollectorNumber: '32',
        expansion: 'Generations Radiant Collection',
    });

    assert.equal(sandbox.collectorNumberMatchRank('RC32/RC32', 'RC32/RC32'), 0);
    assert.equal(sandbox.collectorNumberMatchRank('32/83', 'RC32/RC32'), 99);
    assert.equal(sandbox.expansionMatches('Generations Radiant Collection', 'Radiant Collection'), true);
    assert.equal(sorted[0].card_id, 'rc32');
    assert.equal(sorted.at(-1).card_id, 'tfe-212');
});

test('background ranks eBay Sandstorm collector above broad Zangoose ex rows', () => {
    const sandbox = loadBackgroundHelpers(['sortRowsForStructuredCard', 'collectorNumberMatchRank', 'expansionMatches']);
    const rows = [
        { card_id: 'broad-ex-ah', name: 'Zangoose ex', set_name: 'Ancient Horizons', card_number: '167/182', search_rank: 12000 },
        { card_id: 'sandstorm-14', name: 'Zangoose', set_name: 'EX Sandstorm', card_number: '14/100', search_rank: 10 },
        { card_id: 'sandstorm-15', name: 'Zangoose', set_name: 'EX Sandstorm', card_number: '15/100', search_rank: 9999 },
    ];
    const sorted = sandbox.sortRowsForStructuredCard(rows, {
        name: 'Zangoose',
        searchName: 'Zangoose',
        variation: '',
        collectorNumber: '14/100',
        numericCollectorNumber: '14',
        expansion: 'EX Sandstorm',
    });

    assert.equal(sandbox.collectorNumberMatchRank('14/100', '14/100'), 0);
    assert.equal(sandbox.expansionMatches('EX Sandstorm', 'Tempesta di Sabbia'), true);
    assert.equal(sorted[0].card_id, 'sandstorm-14');
    assert.equal(sorted.at(-1).card_id, 'broad-ex-ah');
});

test('background ranks Vinted Feraligatr level and Mysterious Treasures evidence above ex rows', () => {
    const sandbox = loadBackgroundHelpers([
        'normalizeMarketplacePayload',
        'sortRowsForStructuredCard',
        'buildStructuredFallbackQueries',
        'shouldRunAutocompleteFallback',
    ]);
    const payload = sandbox.normalizeMarketplacePayload({
        source: 'vinted',
        originalTitle: 'Feraligatr liv.53 Tesori Misteriosi',
        searchTitle: 'Feraligatr Lv. 53 Mysterious Treasures',
        selectedClues: ['Feraligatr', 'Lv. 53', 'Mysterious Treasures'],
        primaryClues: ['Feraligatr'],
        name: 'Feraligatr',
        variation: '',
        expansion: 'Mysterious Treasures',
        levelNumber: '53',
    });
    const rows = [
        { card_id: 'feraligatr-ex-103', name: 'Feraligatr ex', set_name: 'Unseen Forces', card_number: '103/115', search_rank: 12000 },
        { card_id: 'feraligatr-53', name: 'Feraligatr Lv. 53', set_name: 'Mysterious Treasures', card_number: '8/123', search_rank: 20 },
        { card_id: 'feraligatr-003', name: 'Feraligatr', set_name: 'Promo', card_number: '003', search_rank: 10000 },
    ];
    const sorted = sandbox.sortRowsForStructuredCard(rows, payload.structuredCard);
    const queries = sandbox.buildStructuredFallbackQueries(payload.structuredCard, payload.searchTitle);

    assert.equal(payload.structuredCard.levelNumber, '53');
    assert.equal(payload.structuredCard.expansion, 'Mysterious Treasures');
    assert.equal(sorted[0].card_id, 'feraligatr-53');
    assert.ok(queries.some((query) => /Feraligatr Lv\. 53 Mysterious Treasures/i.test(query)));
    assert.equal(sandbox.shouldRunAutocompleteFallback([rows[0]], payload.structuredCard), true);
});

test('background ranks Vinted Jolteon Delta Species collector evidence above generic variants', () => {
    const sandbox = loadBackgroundHelpers([
        'normalizeMarketplacePayload',
        'sortRowsForStructuredCard',
        'buildStructuredFallbackQueries',
        'rowMatchesStructuredVariation',
        'shouldRunAutocompleteFallback',
    ]);
    const payload = sandbox.normalizeMarketplacePayload({
        source: 'vinted',
        originalTitle: 'Jolteon specie delta 7/113',
        searchTitle: 'Jolteon Delta Species 7/113',
        selectedClues: ['Jolteon', 'Delta Species', '7/113'],
        primaryClues: ['Jolteon'],
        name: 'Jolteon',
        variation: 'Delta Species',
        collectorNumber: '7/113',
        numericCollectorNumber: '7',
    });
    const rows = [
        { card_id: 'jolteon-ex', name: 'Jolteon ex', set_name: 'Prismatic Evolutions', card_number: '030/131', search_rank: 12000 },
        { card_id: 'jolteon-vmax', name: 'Jolteon VMAX', set_name: 'Promo', card_number: 'SWSH184', search_rank: 11000 },
        { card_id: 'jolteon-delta', name: 'Jolteon Delta Species', set_name: 'EX Delta Species', card_number: '7/113', search_rank: 10 },
        { card_id: 'jolteon-gx', name: 'Jolteon GX', set_name: 'SM Promos', card_number: 'SM173', search_rank: 9000 },
    ];
    const sorted = sandbox.sortRowsForStructuredCard(rows, payload.structuredCard);
    const queries = sandbox.buildStructuredFallbackQueries(payload.structuredCard, payload.searchTitle);

    assert.equal(payload.structuredCard.variation, 'Delta Species');
    assert.ok(payload.structuredCard.variationTokens.includes('deltaspecies'));
    assert.equal(sandbox.rowMatchesStructuredVariation(rows[2], payload.structuredCard), true);
    assert.equal(sandbox.rowMatchesStructuredVariation(rows[0], payload.structuredCard), false);
    assert.equal(sorted[0].card_id, 'jolteon-delta');
    assert.ok(queries.some((query) => /Jolteon Delta Species 7\/113/i.test(query)));
    assert.equal(sandbox.shouldRunAutocompleteFallback([rows[0]], payload.structuredCard), true);
});

test('background normalizes eBay payload for exact Magearna search', () => {
    const sandbox = loadBackgroundHelpers(['normalizeMarketplacePayload']);

    const payload = sandbox.normalizeMarketplacePayload({
        source: 'ebay',
        originalTitle: 'Magearna EX - 110/114 - Pokemon Steam...',
        searchTitle: 'Magearna ex Steam Siege 110/114',
        selectedClues: ['Magearna ex', 'ex', '110/114', 'Steam Siege'],
        primaryClues: ['Magearna ex', 'ex'],
        name: 'Magearna',
        variation: 'ex',
        collectorNumber: '110/114',
        numericCollectorNumber: '110',
        expansion: 'Steam Siege',
        features: [],
    });

    assert.equal(payload.source, 'ebay');
    assert.equal(payload.structuredCard.name, 'Magearna');
    assert.equal(payload.structuredCard.variation, 'ex');
    assert.equal(payload.structuredCard.collectorNumber, '110/114');
    assert.equal(payload.structuredCard.numericCollectorNumber, '110');
    assert.equal(payload.structuredCard.expansion, 'Steam Siege');
    assert.equal(payload.structuredCard.searchName, 'Magearna ex');
});

test('Cardmarket ranking prefers exact name, prefixed collector, and expansion', () => {
    const sandbox = loadBackgroundHelpers(['sortRowsForStructuredCard']);
    const rows = [
        { card_id: 'generic-price', name: 'Piplup', set_name: 'Brilliant Stars', card_number: '35/172', search_rank: 999 },
        { card_id: 'exact', name: 'Piplup', set_name: 'MEP Black Star Promos', card_number: '042', search_rank: 40 },
        { card_id: 'same-number-wrong-set', name: 'Piplup', set_name: 'Ultra Prism', card_number: '42/156', search_rank: 900 },
        { card_id: 'generic-name', name: 'Piplup', set_name: 'MEP Black Star Promos', card_number: '007', search_rank: 950 },
    ];

    const sorted = sandbox.sortRowsForStructuredCard(rows, {
        name: 'Piplup',
        collectorNumber: 'MEP 042',
        numericCollectorNumber: '042',
        expansion: 'MEP Black Star Promos',
    });

    assert.equal(sorted[0].card_id, 'exact');
    assert.equal(sorted.at(-1).card_id, 'generic-price');
});

test('Cardmarket ranks Piplup MEP 042 exact prefixed promo card first', () => {
    const sandbox = loadBackgroundHelpers(['sortRowsForStructuredCard']);
    const rows = [
        { card_id: 'generic-high-score', name: 'Piplup', set_name: 'Stellar Crown', card_number: '006/142', search_rank: 12000 },
        { card_id: 'same-number-slash', name: 'Piplup', set_name: 'Ultra Prism', card_number: '42/156', search_rank: 11000 },
        { card_id: 'bare-number-promo', name: 'Piplup', set_name: 'MEP Black Star Promos', card_number: '042', search_rank: 10000 },
        { card_id: 'mep-042', name: 'Piplup', set_name: 'MEP Black Star Promos', card_number: 'MEP 042', search_rank: 10 },
    ];

    const sorted = sandbox.sortRowsForStructuredCard(rows, {
        name: 'Piplup',
        collectorNumber: 'MEP 042',
        printedCollectorNumber: 'MEP 042',
        numericCollectorNumber: '042',
        expansion: 'MEP Black Star Promos',
    });

    assert.equal(sorted[0].card_id, 'mep-042');
    assert.equal(sorted[1].card_id, 'bare-number-promo');
    assert.equal(sorted.at(-1).card_id, 'generic-high-score');
});

test('Cardmarket structured parser preserves Latias DRS 009 leading zeros', () => {
    const sandbox = loadBackgroundHelpers([
        'scrapeStructuredCardFields',
        'buildStructuredFallbackQueries',
        'collectorNumberMatchRank',
        'expansionMatches',
    ]);

    const structured = sandbox.scrapeStructuredCardFields(
        'Latias (DRS 009)',
        { expansion: 'DRS', details: { number: '009' } }
    );

    assert.equal(structured.name, 'Latias');
    assert.equal(structured.collectorNumber, 'DRS 009');
    assert.equal(structured.printedCollectorNumber, 'DRS 009');
    assert.equal(structured.numericCollectorNumber, '009');
    assert.equal(structured.expansion, 'Dragon Selection');
    assert.equal(sandbox.expansionMatches('Dragon Selection', 'DRS'), true);
    assert.ok(
        sandbox.collectorNumberMatchRank('9/020', 'DRS 009') > sandbox.collectorNumberMatchRank('009/020', 'DRS 009'),
        'numeric equivalence should not outrank exact padded collector comparison'
    );
    assert.ok(
        sandbox.buildStructuredFallbackQueries(structured, 'Latias (DRS 009)').includes('Latias DRS 009'),
        'fallback queries should preserve the padded DRS collector payload'
    );
});

test('Cardmarket ranks Latias DRS 009 Dragon Selection above other Latias variants', () => {
    const sandbox = loadBackgroundHelpers(['sortRowsForStructuredCard']);
    const rows = [
        { card_id: 'alto-mare-011', name: "Alto Mare's Latias", set_name: 'Theater VS Pack', card_number: '011/018', search_rank: 999999 },
        { card_id: 'latias-dragon-vault', name: 'Latias', set_name: 'Dragon Vault', card_number: '009/020', search_rank: 50000 },
        { card_id: 'latias-drs-009', name: 'Latias', set_name: 'Dragon Selection', card_number: '009/020', search_rank: 10 },
        { card_id: 'latias-drs-unpadded', name: 'Latias', set_name: 'Dragon Selection', card_number: '9/020', search_rank: 20000 },
    ];

    const sorted = sandbox.sortRowsForStructuredCard(rows, {
        name: 'Latias',
        collectorNumber: 'DRS 009',
        printedCollectorNumber: 'DRS 009',
        numericCollectorNumber: '009',
        expansion: 'Dragon Selection',
    });

    assert.equal(sorted[0].card_id, 'latias-drs-009');
    assert.equal(sorted[1].card_id, 'latias-drs-unpadded');
    assert.equal(sorted.at(-1).card_id, 'alto-mare-011');
});

test('Cardmarket ranks Machamp HL 9 above VMAX name-only results', () => {
    const sandbox = loadBackgroundHelpers([
        'scrapeStructuredCardFields',
        'sortRowsForStructuredCard',
        'filterStrongExactRows',
        'collectorNumberMatchRank',
        'expansionMatches',
    ]);
    const structured = sandbox.scrapeStructuredCardFields(
        'Machamp (HL 9)',
        { expansion: 'EX Leggende Nascoste', details: { number: '9' } }
    );
    const rows = [
        { card_id: 'machamp-vmax', name: 'Machamp VMAX', set_name: 'Astral Radiance', card_number: '073/189', search_rank: 999999 },
        { card_id: 'machamp-hl-9', name: 'Machamp', set_name: 'EX Hidden Legends', card_number: '9/101', search_rank: 10 },
        { card_id: 'machamp-base', name: 'Machamp', set_name: 'Base Set', card_number: '8/102', search_rank: 9000 },
    ];

    assert.equal(structured.name, 'Machamp');
    assert.equal(structured.collectorNumber, 'HL 9');
    assert.equal(structured.printedCollectorNumber, 'HL 9');
    assert.equal(structured.numericCollectorNumber, '9');
    assert.equal(structured.expansion, 'EX Hidden Legends');
    assert.equal(sandbox.expansionMatches('EX Hidden Legends', 'EX Leggende Nascoste'), true);
    assert.equal(sandbox.collectorNumberMatchRank('9/101', 'HL 9') < 99, true);

    const sorted = sandbox.sortRowsForStructuredCard(rows, structured);
    const exactRows = sandbox.filterStrongExactRows(sorted, structured);
    assert.equal(sorted[0].card_id, 'machamp-hl-9');
    assert.deepEqual(Array.from(exactRows.map((row) => row.card_id)), ['machamp-hl-9']);
});

test('Cardmarket ranks Team Rocket TR 62 above Perfect Order Meowth ex', () => {
    const sandbox = loadBackgroundHelpers(['sortRowsForStructuredCard', 'expansionMatches']);
    const rows = [
        { card_id: 'meowth-po-062', name: 'Meowth ex', set_name: 'Perfect Order', card_number: '062', search_rank: 9999 },
        { card_id: 'meowth-tr-62', name: 'Meowth', set_name: 'Team Rocket', card_number: '62/82', search_rank: 10 },
    ];

    assert.equal(sandbox.expansionMatches('Team Rocket', 'TR Team Rocket'), true);
    const sorted = sandbox.sortRowsForStructuredCard(rows, {
        name: 'Meowth',
        collectorNumber: 'TR 62',
        printedCollectorNumber: 'TR 62',
        numericCollectorNumber: '62',
        expansion: 'TR Team Rocket',
    });

    assert.equal(sorted[0].card_id, 'meowth-tr-62');
    assert.equal(sorted.at(-1).card_id, 'meowth-po-062');
});

test('Cardmarket promo expansion aliases keep promo wording significant', () => {
    const sandbox = loadBackgroundHelpers(['expansionMatches', 'sortRowsForStructuredCard']);

    assert.equal(sandbox.expansionMatches('MEP Black Star Promo', 'MEP Black Star Promos'), true);
    assert.equal(sandbox.expansionMatches('Black Star Promos', 'MEP Black Star Promos'), true);
    assert.equal(sandbox.expansionMatches('MEP Black Star Promos', 'Black Star Promo'), true);

    const rows = [
        { card_id: 'wrong-set', name: 'Piplup', set_name: 'Mega Evolution', card_number: 'MEP 042', search_rank: 9999 },
        { card_id: 'alias-set', name: 'Piplup', set_name: 'Black Star Promo', card_number: 'MEP 042', search_rank: 1 },
    ];
    const sorted = sandbox.sortRowsForStructuredCard(rows, {
        name: 'Piplup',
        collectorNumber: 'MEP 042',
        expansion: 'MEP Black Star Promos',
    });

    assert.equal(sorted[0].card_id, 'alias-set');
});

test('Cardmarket background search payload uses structured card name first', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return {
                    ok: true,
                    json: async () => ({
                        blueprint_id: new URL(url).searchParams.get('blueprintId'),
                        price_pkn: 321,
                        currency: 'PKN',
                    }),
                };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/marketplace-autocomplete')) {
                return {
                    ok: true,
                    json: async () => ({
                        rows: body.search_term === 'Camerupt'
                            ? [{ card_id: '1', name: 'Camerupt', canonical_name: 'Camerupt', search_rank: 99 }]
                            : [],
                    }),
                };
            }
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            cardId: '1',
                            name: 'Camerupt',
                            expansionName: 'Ascended Heroes',
                            collectorNumber: '028',
                            score: 95,
                        }],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({ id: 8, title: 'Camerupt (ASC 028)', url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Ascended-Heroes/Camerupt-ASC028' }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Camerupt (ASC 028)',
                url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Ascended-Heroes/Camerupt-ASC028',
            },
            { tab: { id: 8, title: 'Camerupt (ASC 028)', url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Ascended-Heroes/Camerupt-ASC028' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results[0].name_en, 'Camerupt');
    assert.equal(response.results[0].pokoin_price, '');
    const extensionPayload = fetchBodies.find((entry) => entry.url.includes('/api/extension-card-search')).body;
    assert.equal(extensionPayload.name, 'Camerupt');
    assert.equal(extensionPayload.collectorNumber, 'ASC 028');
});

test('Vinted side panel opens from overlay preview rows without reordering selected candidate', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storage = {};
    const storageWrites = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true, json: async () => ({ products: [] }) }),
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                get: async () => ({ id: 77, title: 'Dragonite V', url: 'https://www.vinted.it/items/77-dragonite-v' }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (key) => (typeof key === 'string' ? { [key]: storage[key] } : { ...storage }),
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        storageWrites.push(payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async () => {},
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'openSidePanelForCurrentTab',
                url: 'https://www.vinted.it/items/77-dragonite-v',
                title: 'Dragonite V',
                originalTitle: 'Carta Pokemon Dragonite V',
                clues: ['Dragonite V', 'V'],
                primaryClues: ['Dragonite V', 'V'],
                previewSource: 'vinted_overlay',
                previewSignature: 'vinted|dragonitev',
                selectedCandidateId: '222',
                selectedCandidate: { card_id: '222', name: 'Dragonite V', set_name: 'Promo', card_number: 'SWSH222' },
                previewRows: [
                    { card_id: '111', name: 'Dragonite V', set_name: 'Evolving Skies', card_number: '192/203' },
                    { card_id: '222', name: 'Dragonite V', set_name: 'Promo', card_number: 'SWSH222' },
                ],
            },
            { tab: { id: 77, title: 'Dragonite V', url: 'https://www.vinted.it/items/77-dragonite-v' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.deepEqual(response.result.rows.map((row) => row.card_id), ['111', '222']);
    assert.equal(response.result.best.card_id, '222');
    assert.equal(storage.sidePanelState.debug.pinnedVintedPreview, true);
    assert.deepEqual(storage.sidePanelState.rows.map((row) => row.card_id), ['111', '222']);
    assert.equal(storageWrites.at(-1).sidePanelState.debug.previewSource, 'vinted_overlay');
});

test('Vinted side panel refresh keeps pinned overlay preview rows', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let fetchCalls = 0;
    const pinnedState = {
        updatedAt: Date.now(),
        pageInfo: {
            title: 'Dragonite V',
            url: 'https://www.vinted.it/items/78-dragonite-v',
            hostname: 'www.vinted.it',
            clues: ['Dragonite V', 'V'],
            primaryClues: ['Dragonite V', 'V'],
            previewSignature: 'vinted|dragonitev',
        },
        rows: [
            { card_id: '111', name: 'Dragonite V', set_name: 'Evolving Skies', card_number: '192/203' },
            { card_id: '222', name: 'Dragonite V', set_name: 'Promo', card_number: 'SWSH222' },
        ],
        best: { card_id: '111', name: 'Dragonite V' },
        blueprintId: '111',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/111',
        error: '',
        debug: {
            pinnedPreviewRows: true,
            pinnedVintedPreview: true,
            previewSource: 'vinted_overlay',
            previewSignature: 'vinted|dragonitev',
        },
    };
    const storage = { sidePanelState: pinnedState };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            fetchCalls += 1;
            return { ok: true, json: async () => ({}) };
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [{ id: 78, title: 'Dragonite V', url: 'https://www.vinted.it/items/78-dragonite-v' }],
                get: async () => ({ id: 78, title: 'Dragonite V', url: 'https://www.vinted.it/items/78-dragonite-v' }),
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (key) => (typeof key === 'string' ? { [key]: storage[key] } : { ...storage }),
                    set: async (payload) => Object.assign(storage, payload),
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener({ action: 'resolveActiveTabForSidePanel' }, {}, resolve);
    });

    assert.equal(response.success, true);
    assert.deepEqual(response.result.rows.map((row) => row.card_id), ['111', '222']);
    assert.ok(fetchCalls <= 2, 'refresh may only decorate pinned Vinted preview prices');
});

test('side panel refresh forwards stored eBay selected-key payload', async () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const makeElement = (id) => {
        const element = {
            id,
            textContent: '',
            hidden: false,
            src: '',
            classList: createClassListStub(),
            replaceChildren() {
                this.children = [];
            },
            appendChild(child) {
                this.children = [...(this.children || []), child];
                return child;
            },
            addEventListener(type, listener) {
                if (id === 'refreshBtn' && type === 'click') {
                    this.click = listener;
                }
            },
        };
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo', 'debugInfo']) {
        makeElement(id);
    }
    const ebayPayload = {
        source: 'ebay',
        searchTitle: 'Zangoose EX Sandstorm 14/100',
        name: 'Zangoose',
        collectorNumber: '14/100',
        numericCollectorNumber: '14',
        expansion: 'EX Sandstorm',
        selectedClues: ['Zangoose', 'EX Sandstorm', '14/100'],
        primaryClues: ['Zangoose'],
    };
    const messages = [];
    const sandbox = {
        document: {
            body: { classList: createClassListStub() },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => createDomElement(tagName),
        },
        chrome: {
            storage: {
                session: {
                    get: async () => ({
                        sidePanelState: {
                            pageInfo: {
                                title: 'Zangoose EX Sandstorm 14/100',
                                selectedClues: ebayPayload.selectedClues,
                                primaryClues: ebayPayload.primaryClues,
                                ebayPayload,
                                marketplacePayload: ebayPayload,
                            },
                        },
                    }),
                },
                onChanged: { addListener() {} },
            },
            runtime: {
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true };
                },
            },
        },
        fetch: async () => ({ ok: false, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'ui-pages/sidepanel.js' });

    await elementsById.get('refreshBtn').click();

    const refreshMessage = messages.find((message) => message.action === 'resolveActiveTabForSidePanel');
    assert.deepEqual(refreshMessage.clues, ebayPayload.selectedClues);
    assert.deepEqual(refreshMessage.primaryClues, ebayPayload.primaryClues);
    assert.equal(refreshMessage.ebayPayload.collectorNumber, '14/100');
    assert.equal(refreshMessage.marketplacePayload.source, 'ebay');
});

test('side panel candidate rows prefer set logos before preview thumbnails', async () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const makeElement = (id) => {
        const element = createDomElement('div');
        element.id = id;
        element.hidden = false;
        element.classList = createClassListStub();
        element.replaceChildren = function replaceChildren(...children) {
            this.children = [];
            children.forEach((child) => this.appendChild(child));
        };
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo', 'debugInfo']) {
        makeElement(id);
    }
    elementsById.get('refreshBtn').addEventListener = () => {};
    const state = {
        pageInfo: { title: 'Mew ex 232/091' },
        rows: [{
            card_id: '274416',
            name: 'Mew ex',
            set_name: 'Paldean Fates',
            card_number: 'Special Illustration Rare | 232/091',
            expansion_symbol_url: 'https://cdn.pokoin.com/expansions/symbols/paldean-fates.png',
            preview_image_url: 'https://cdn.pokoin.com/previews/274416_mew-ex.jpg',
            canonicalUrl: 'https://pokoin.com/marketplace/en/cards/548832/special-illustration-rare-mew-ex-232-091-paldean-fates',
        }],
        best: {
            card_id: '274416',
            name: 'Mew ex',
            preview_image_url: 'https://cdn.pokoin.com/previews/274416_mew-ex.jpg',
            canonicalUrl: 'https://pokoin.com/marketplace/en/cards/548832/special-illustration-rare-mew-ex-232-091-paldean-fates',
        },
        blueprintId: '274416',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/548832/special-illustration-rare-mew-ex-232-091-paldean-fates',
    };
    const sandbox = {
        document: {
            body: { classList: createClassListStub() },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => createDomElement(tagName),
        },
        chrome: {
            storage: {
                session: { get: async () => ({ sidePanelState: state }) },
                onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({ success: true }) },
        },
        fetch: async () => ({ ok: false, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'ui-pages/sidepanel.js' });

    await Promise.resolve();
    await Promise.resolve();

    sandbox.renderState(state);
    const candidate = elementsById.get('candidateList').children[0];
    const media = candidate.children[0];
    const logo = media.children[0];
    assert.equal(media.children.length, 1);
    assert.equal(logo.className, 'candidate-logo');
    assert.equal(logo.src, 'https://cdn.pokoin.com/expansions/symbols/paldean-fates.png');

    sandbox.renderState({
        ...state,
        rows: [{
            card_id: '274417',
            name: 'Mew ex',
            set_name: '',
            card_number: 'Special Illustration Rare | 232/091',
            preview_image_url: 'https://cdn.pokoin.com/previews/274417_mew-ex.jpg',
            canonicalUrl: 'https://pokoin.com/marketplace/en/cards/274417',
        }],
        best: {
            card_id: '274417',
            name: 'Mew ex',
            preview_image_url: 'https://cdn.pokoin.com/previews/274417_mew-ex.jpg',
            canonicalUrl: 'https://pokoin.com/marketplace/en/cards/274417',
        },
        blueprintId: '274417',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/274417',
    });
    const fallbackMedia = elementsById.get('candidateList').children[0].children[0];
    const fallbackImage = fallbackMedia.children[0];
    assert.equal(fallbackMedia.children.length, 1);
    assert.equal(fallbackImage.className, 'candidate-preview-image');
    assert.equal(fallbackImage.src, 'https://cdn.pokoin.com/previews/274417_mew-ex.jpg');
});

test('Vinted side panel Refresh reuses canonical overlay preview rows', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let fetchCalls = 0;
    const storage = {};
    const storageWrites = [];
    const tab = {
        id: 80,
        title: 'Obstagoon di Galar 245/217 accesa eroica',
        url: 'https://www.vinted.it/items/80-obstagoon-di-galar',
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            fetchCalls += 1;
            throw new Error('Vinted refresh should use canonical preview rows');
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [tab],
                get: async () => tab,
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('Vinted refresh should not run active-tab scrape');
                },
            },
            storage: {
                session: {
                    get: async (key) => (typeof key === 'string' ? { [key]: storage[key] } : { ...storage }),
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    await new Promise((resolve) => {
        messageListener(
            {
                action: 'marketplacePreviewReady',
                source: 'vinted',
                url: tab.url,
                title: 'Obstagoon di Galar 245/217',
                originalTitle: tab.title,
                clues: ['Obstagoon', '245/217'],
                primaryClues: ['Obstagoon'],
                previewSource: 'vinted_overlay',
                previewSignature: 'vinted|obstagoon245217',
                vintedPayload: {
                    source: 'vinted',
                    listingKey: tab.url,
                    originalTitle: tab.title,
                    searchTitle: 'Obstagoon di Galar 245/217',
                    name: 'Obstagoon',
                    collectorNumber: '245/217',
                    numericCollectorNumber: '245',
                    selectedClues: ['Obstagoon', '245/217'],
                    primaryClues: ['Obstagoon'],
                    selectedChipCategories: ['name:Obstagoon', 'collector:245/217'],
                },
                previewRows: [
                    { card_id: 'obstagoon-245', name: 'Galarian Obstagoon', set_name: 'Evolving Skies', card_number: '245/217' },
                ],
            },
            { tab },
            resolve
        );
    });

    const response = await new Promise((resolve) => {
        messageListener({ action: 'resolveActiveTabForSidePanel', forceRefresh: true }, {}, resolve);
    });

    assert.equal(response.success, true);
    assert.deepEqual(response.result.rows.map((row) => row.card_id), ['obstagoon-245']);
    assert.ok(fetchCalls <= 1, 'refresh may only decorate canonical Vinted preview prices');
    assert.equal(storage.sidePanelState.pageInfo.vintedPayload.collectorNumber, '245/217');
    assert.deepEqual(storage.sidePanelState.rows.map((row) => row.card_id), ['obstagoon-245']);
    assert.equal(storageWrites.at(-1).debug.vintedReadyDriven, true);
});

test('Vinted side panel Refresh waits when canonical overlay state is not ready', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let fetchCalls = 0;
    let scraped = false;
    const storage = {};
    const tab = {
        id: 81,
        title: 'Loading Vinted item',
        url: 'https://www.vinted.it/items/81-loading',
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            fetchCalls += 1;
            return { ok: true, json: async () => ({ rows: [] }) };
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [tab],
                get: async () => tab,
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    scraped = true;
                    return [];
                },
            },
            storage: {
                session: {
                    get: async (key) => (typeof key === 'string' ? { [key]: storage[key] } : { ...storage }),
                    set: async (payload) => Object.assign(storage, payload),
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener({ action: 'resolveActiveTabForSidePanel', forceRefresh: true }, {}, resolve);
    });

    assert.equal(response.success, true);
    assert.equal(response.result.loading, true);
    assert.equal(storage.sidePanelState.loading, true);
    assert.equal(storage.sidePanelState.debug.waitingForVintedPreview, true);
    assert.equal(fetchCalls, 0);
    assert.equal(scraped, false);
});

test('Vinted duplicate preview-ready events coalesce one side-panel write', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storage = {};
    const storageWrites = [];
    const tab = {
        id: 82,
        title: 'Mega Charizard ex',
        url: 'https://www.vinted.it/items/82-mega-charizard',
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true, json: async () => ({}) }),
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [tab],
                get: async () => tab,
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (key) => (typeof key === 'string' ? { [key]: storage[key] } : { ...storage }),
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const request = {
        action: 'marketplacePreviewReady',
        source: 'vinted',
        url: tab.url,
        title: 'Mega Charizard',
        originalTitle: tab.title,
        clues: ['Mega Charizard'],
        selectedClues: ['Mega Charizard'],
        primaryClues: ['Mega Charizard'],
        previewSource: 'vinted_overlay',
        previewSignature: 'vinted|mega-charizard|canonical',
        selectionRevision: 1,
        vintedPayload: {
            source: 'vinted',
            listingKey: tab.url,
            originalTitle: tab.title,
            searchTitle: 'Mega Charizard',
            name: 'Charizard',
            variation: 'Mega',
            selectedClues: ['Mega Charizard'],
            primaryClues: ['Mega Charizard'],
        },
        previewRows: [
            { card_id: 'mega-charizard-1', name: 'Mega Charizard EX', set_name: 'Evolutions', card_number: '12/108' },
            { card_id: 'mega-charizard-2', name: 'Mega Charizard Y EX', set_name: 'Promo', card_number: '13/106' },
        ],
    };

    const [first, second, third] = await Promise.all([
        new Promise((resolve) => messageListener(request, { tab }, resolve)),
        new Promise((resolve) => messageListener({ ...request }, { tab }, resolve)),
        new Promise((resolve) => messageListener({ ...request }, { tab }, resolve)),
    ]);

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(third.success, true);
    assert.equal(storageWrites.filter((state) => state?.debug?.pinnedVintedPreview || state?.debug?.vintedReadyDriven).length, 1);
    assert.deepEqual(Array.from(storage.sidePanelState.rows.map((row) => row.card_id)), ['mega-charizard-1', 'mega-charizard-2']);
});

test('Vinted extension action waits for selected-key payload before searching', async () => {
    const source = readRepoFile('config/background.js');
    let actionClickListener = null;
    let fetchCalls = 0;
    let scraped = false;
    const storage = {};
    const tab = {
        id: 87,
        title: 'Pikachu volo Vmax 007/025',
        url: 'https://www.vinted.it/items/87-pikachu-volo-vmax',
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            fetchCalls += 1;
            return { ok: true, json: async () => ({ rows: [] }) };
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                get: async () => tab,
                query: async () => [tab],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    scraped = true;
                    return [];
                },
            },
            storage: {
                session: {
                    get: async (key) => (typeof key === 'string' ? { [key]: storage[key] } : { ...storage }),
                    set: async (payload) => Object.assign(storage, payload),
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async () => {},
                setOptions: async () => {},
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: {
                setIcon: async () => {},
                onClicked: {
                    addListener(listener) {
                        actionClickListener = listener;
                    },
                },
            },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    await actionClickListener(tab);

    assert.equal(storage.sidePanelState.loading, true);
    assert.equal(storage.sidePanelState.debug.waitingForVintedPreview, true);
    assert.equal(storage.sidePanelState.debug.refreshFailureReason, 'action-click-awaiting-vinted-preview');
    assert.equal(fetchCalls, 0);
    assert.equal(scraped, false);
});

test('Vinted navigation waits for preview rows and manual refresh can force token search', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storage = {};
    const storageWrites = [];
    const fetchBodies = [];
    let scraped = false;
    let activeTab = {
        id: 84,
        title: 'Cleffa 20/111',
        url: 'https://www.vinted.it/items/84-cleffa-20-111',
    };
    const expectedByUrl = {
        [activeTab.url]: {
            name: 'Cleffa',
            collectorNumber: '20/111',
            row: { cardId: 'cleffa-20', name: 'Cleffa', expansionName: 'Neo Genesis', collectorNumber: '20/111', score: 99 },
        },
        'https://www.vinted.it/items/85-magneton-promo-159': {
            name: 'Magneton',
            collectorNumber: 'PROMO 159',
            row: { cardId: 'magneton-promo-159', name: 'Magneton', expansionName: 'SV Black Star Promos', collectorNumber: '159', score: 98 },
        },
        'https://www.vinted.it/items/86-rocket-zapdos-15-132': {
            name: 'Rocket Zapdos',
            collectorNumber: '15/132',
            row: { cardId: 'rocket-zapdos-15', name: 'Rocket Zapdos', expansionName: 'Gym Challenge', collectorNumber: '15/132', score: 97 },
        },
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                const expected = expectedByUrl[activeTab.url];
                assert.equal(body.name, expected.name);
                assert.equal(body.collectorNumber, expected.collectorNumber);
                assert.equal(body.variation || '', '');
                return {
                    ok: true,
                    json: async () => ({ matches: [expected.row] }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return { ok: true, json: async () => ({ rows: [] }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [activeTab],
                get: async () => activeTab,
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    scraped = true;
                    throw new Error('Vinted token-ready path must not scrape active tab');
                },
            },
            storage: {
                session: {
                    get: async (key) => (typeof key === 'string' ? { [key]: storage[key] } : { ...storage }),
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    await new Promise((resolve) => {
        messageListener({ action: 'marketplaceNavigationChanged' }, { tab: activeTab }, resolve);
    });

    assert.equal(storage.sidePanelState.loading, true);
    assert.equal(storage.sidePanelState.debug.waitingForVintedPreview, true);
    assert.equal(fetchBodies.length, 0, 'navigation must not search before tokens are ready');
    assert.equal(scraped, false);

    for (const [url, expected] of Object.entries(expectedByUrl)) {
        activeTab = {
            id: 84,
            title: `${expected.name} ${expected.collectorNumber}`,
            url,
        };
        await new Promise((resolve) => {
            messageListener({ action: 'marketplaceNavigationChanged' }, { tab: activeTab }, resolve);
        });
        assert.equal(storage.sidePanelState.loading, true);
        assert.equal(storage.sidePanelState.debug.waitingForVintedPreview, true);
        const selectedClues = [expected.name, expected.collectorNumber];
        const fetchCountBeforeTokenReady = fetchBodies.length;
        const tokenResponse = await new Promise((resolve) => {
            messageListener(
                {
                    action: 'marketplacePreviewReady',
                    source: 'vinted',
                    tokensReady: true,
                    url,
                    title: `${expected.name} ${expected.collectorNumber}`,
                    originalTitle: `${expected.name} ${expected.collectorNumber}`,
                    clues: selectedClues,
                    selectedClues,
                    primaryClues: [expected.name],
                    previewSource: 'vinted_overlay_tokens',
                    previewSignature: `vinted|${expected.name}|${expected.collectorNumber}`,
                    vintedPayload: {
                        source: 'vinted',
                        listingKey: url,
                        originalTitle: `${expected.name} ${expected.collectorNumber}`,
                        searchTitle: `${expected.name} ${expected.collectorNumber}`,
                        name: expected.name,
                        variation: '',
                        collectorNumber: expected.collectorNumber,
                        numericCollectorNumber: expected.collectorNumber.match(/\d+/)?.[0] || '',
                        selectedClues,
                        primaryClues: [expected.name],
                        selectedChipCategories: [
                            { label: expected.name, value: expected.name, category: 'name' },
                            { label: expected.collectorNumber, value: expected.collectorNumber, category: 'collector' },
                        ],
                    },
                },
                { tab: activeTab },
                resolve
            );
        });

        assert.equal(tokenResponse.success, true);
        assert.equal(tokenResponse.deferred, true);
        assert.equal(tokenResponse.reason, 'awaiting-vinted-preview-rows');
        assert.equal(storage.sidePanelState.loading, true);
        assert.equal(storage.sidePanelState.debug.waitingForVintedPreview, true);
        const fetchCountAfterTokenReady = fetchBodies.length;
        assert.equal(fetchCountAfterTokenReady, fetchCountBeforeTokenReady, 'token-ready should not refresh before preview rows arrive');

        const refreshResponse = await new Promise((resolve) => {
            messageListener({ action: 'resolveActiveTabForSidePanel', forceRefresh: true }, {}, resolve);
        });
        assert.equal(fetchBodies.length, fetchCountAfterTokenReady + 1, 'manual refresh should force one selected-key search');
        assert.equal(refreshResponse.success, true);
        assert.deepEqual([...refreshResponse.result.rows.map((row) => row.card_id)], [expected.row.cardId]);
        assert.equal(refreshResponse.result.pageInfo.vintedPayload.name, expected.name);
        assert.equal(refreshResponse.result.pageInfo.vintedPayload.collectorNumber, expected.collectorNumber);
        assert.equal(storage.sidePanelState.debug.vintedTokenReadyDriven, true);

        const previewResponse = await new Promise((resolve) => {
            messageListener(
                {
                    action: 'marketplacePreviewReady',
                    source: 'vinted',
                    url,
                    title: `${expected.name} ${expected.collectorNumber}`,
                    originalTitle: `${expected.name} ${expected.collectorNumber}`,
                    clues: selectedClues,
                    selectedClues,
                    primaryClues: [expected.name],
                    previewSource: 'vinted_overlay',
                    previewSignature: `vinted|${expected.name}|${expected.collectorNumber}`,
                    vintedPayload: {
                        source: 'vinted',
                        listingKey: url,
                        originalTitle: `${expected.name} ${expected.collectorNumber}`,
                        searchTitle: `${expected.name} ${expected.collectorNumber}`,
                        name: expected.name,
                        collectorNumber: expected.collectorNumber,
                        numericCollectorNumber: expected.collectorNumber.match(/\d+/)?.[0] || '',
                        selectedClues,
                        primaryClues: [expected.name],
                    },
                    previewRows: [
                        { card_id: expected.row.cardId, name: expected.row.name, set_name: expected.row.expansionName, card_number: expected.row.collectorNumber },
                    ],
                },
                { tab: activeTab },
                resolve
            );
        });
        assert.equal(previewResponse.success, true);
        assert.deepEqual(previewResponse.result.rows.map((row) => row.card_id), [expected.row.cardId]);
    }

    assert.equal(scraped, false);
    assert.ok(fetchBodies.every((entry) => entry.url.includes('/api/extension-card-search') || entry.url.includes('/api/marketplace-blueprint-price')));
});

test('Vinted stale old-page preview-ready message is ignored', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storage = {};
    const oldTab = {
        id: 82,
        title: 'Old Vinted item',
        url: 'https://www.vinted.it/items/82-old',
    };
    const newTab = {
        id: 82,
        title: 'Obstagoon di Galar 245/217 accesa eroica',
        url: 'https://www.vinted.it/items/83-obstagoon',
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true, json: async () => ({}) }),
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [newTab],
                get: async () => newTab,
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (key) => (typeof key === 'string' ? { [key]: storage[key] } : { ...storage }),
                    set: async (payload) => Object.assign(storage, payload),
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'marketplacePreviewReady',
                source: 'vinted',
                url: oldTab.url,
                title: oldTab.title,
                originalTitle: oldTab.title,
                vintedPayload: {
                    source: 'vinted',
                    listingKey: oldTab.url,
                    originalTitle: oldTab.title,
                    searchTitle: oldTab.title,
                    name: 'Pikachu',
                    selectedClues: ['Pikachu'],
                    primaryClues: ['Pikachu'],
                },
                previewRows: [{ card_id: 'old-card', name: 'Pikachu' }],
            },
            { tab: oldTab },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.ignored, true);
    assert.equal(storage.sidePanelState, undefined);
});

test('Vinted price enrichment only decorates pinned preview rows', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storage = {};
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url) => {
            const parsed = new URL(url);
            assert.equal(parsed.pathname, '/api/marketplace-blueprint-price');
            const id = parsed.searchParams.get('blueprintId');
            return {
                ok: id === '222' ? false : true,
                status: id === '222' ? 404 : 200,
                json: async () => ({
                    blueprint_id: id,
                    price_pkn: id === '111' ? 111 : null,
                    currency: 'PKN',
                }),
            };
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                get: async () => ({ id: 79, title: 'Dragonite V', url: 'https://www.vinted.it/items/79-dragonite-v' }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (key) => (typeof key === 'string' ? { [key]: storage[key] } : { ...storage }),
                    set: async (payload) => Object.assign(storage, payload),
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async () => {},
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    await new Promise((resolve) => {
        messageListener(
            {
                action: 'openSidePanelForCurrentTab',
                url: 'https://www.vinted.it/items/79-dragonite-v',
                title: 'Dragonite V',
                originalTitle: 'Carta Pokemon Dragonite V',
                clues: ['Dragonite V'],
                primaryClues: ['Dragonite V'],
                previewSource: 'vinted_overlay',
                previewSignature: 'vinted|dragonitev',
                previewRows: [
                    { card_id: '111', name: 'Dragonite V', set_name: 'Evolving Skies', card_number: '192/203' },
                    { card_id: '222', name: 'Dragonite V', set_name: 'Promo', card_number: 'SWSH222' },
                ],
            },
            { tab: { id: 79, title: 'Dragonite V', url: 'https://www.vinted.it/items/79-dragonite-v' } },
            resolve
        );
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(storage.sidePanelState.rows.map((row) => row.card_id), ['111', '222']);
    assert.deepEqual(storage.sidePanelState.rows.map((row) => row.pokoin_price || ''), ['111 PKN', '']);
    assert.equal(storage.sidePanelState.debug.priceEnriched, true);
});

test('background canonical Pokoin URLs propagate from exact search rows', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storage = {};
    const canonicalUrl = 'https://pokoin.com/marketplace/en/cards/548832/special-illustration-rare-mew-ex-232-091-paldean-fates';
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ blueprint_id: '274416', price_pkn: null }) };
            }
            const body = JSON.parse(options.body || '{}');
            if (url.includes('/api/extension-card-search')) {
                assert.equal(body.collectorNumber, '232/091');
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            blueprintId: '274416',
                            name: 'Mew ex',
                            expansionName: 'Paldean Fates',
                            collectorNumber: 'Special Illustration Rare | 232/091',
                            imageUrl: 'https://cdn.pokoin.com/274416_mew-ex.jpg',
                            previewImageUrl: 'https://cdn.pokoin.com/previews/274416_mew-ex.jpg',
                            canonicalUrl,
                            marketplaceUrl: canonicalUrl,
                            canonicalPath: '/marketplace/en/cards/548832/special-illustration-rare-mew-ex-232-091-paldean-fates',
                            marketplacePath: '/marketplace/en/cards/548832/special-illustration-rare-mew-ex-232-091-paldean-fates',
                            score: 99,
                        }],
                    }),
                };
            }
            return { ok: true, json: async () => ({ rows: [] }) };
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                get: async () => ({ id: 91, title: 'Mew ex 232/091', url: 'https://www.vinted.it/items/91-mew-ex' }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (key) => (typeof key === 'string' ? { [key]: storage[key] } : { ...storage }),
                    set: async (payload) => Object.assign(storage, payload),
                },
                local: { set: async () => {} },
            },
            sidePanel: { open: async () => {}, setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener({
            action: 'openSidePanelForCurrentTab',
            url: 'https://www.vinted.it/items/91-mew-ex',
            title: 'Mew ex 232/091',
            originalTitle: 'Mew ex 232/091',
            selectedClues: ['Mew ex', '232/091'],
            primaryClues: ['Mew ex'],
            marketplacePayload: {
                source: 'vinted',
                listingKey: 'https://www.vinted.it/items/91-mew-ex',
                originalTitle: 'Mew ex 232/091',
                searchTitle: 'Mew ex 232/091',
                name: 'Mew',
                variation: 'ex',
                collectorNumber: '232/091',
                selectedClues: ['Mew ex', '232/091'],
                primaryClues: ['Mew ex'],
            },
        }, { tab: { id: 91, title: 'Mew ex 232/091', url: 'https://www.vinted.it/items/91-mew-ex' } }, resolve);
    });

    assert.equal(response.success, true);
    assert.equal(response.result.pokoinUrl, canonicalUrl);
    assert.equal(storage.sidePanelState.pokoinUrl, canonicalUrl);
    assert.equal(storage.sidePanelState.rows[0].canonicalUrl, canonicalUrl);
    assert.equal(storage.sidePanelState.best.marketplacePath, '/marketplace/en/cards/548832/special-illustration-rare-mew-ex-232-091-paldean-fates');
    assert.equal(storage.sidePanelState.rows[0].preview_image_url, 'https://cdn.pokoin.com/previews/274416_mew-ex.jpg');
});

test('legacy Vinted fallback is inert when VintedProcessor owns matching', () => {
    const source = readRepoFile('content.js');
    const functionSource = extractFunctionSource(source, 'patchVintedProductPage');
    let searched = false;
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        window: {
            location: { hostname: 'www.vinted.it' },
            vintedProcessor: {},
        },
        document: {
            querySelector: () => {
                throw new Error('legacy fallback should not inspect Vinted DOM');
            },
            createElement: () => createDomElement('div'),
        },
        extractTitleInfo: () => ({ pokemonName: 'Dragonite' }),
        searchCardInDatabase: async () => {
            searched = true;
            return [];
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${functionSource}\npatchVintedProductPage();`, sandbox, { filename: 'content.js' });

    assert.equal(searched, false);
});

test('Cardmarket Piplup prefixed number uses structured payload and exact ranking', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/marketplace-autocomplete')) {
                return {
                    ok: true,
                    json: async () => ({
                        rows: body.search_term === 'Piplup'
                            ? [{ card_id: 'name', name: 'Piplup', canonical_name: 'Piplup', search_rank: 100 }]
                            : [],
                    }),
                };
            }
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            {
                                cardId: 'generic',
                                name: 'Piplup',
                                expansionName: 'Pokemon 151',
                                collectorNumber: '179',
                                score: 9999,
                            },
                            {
                                cardId: 'mep-042',
                                name: 'Piplup',
                                expansionName: 'MEP Black Star Promos',
                                collectorNumber: 'MEP 042',
                                score: 20,
                            },
                            {
                                cardId: 'mep-043',
                                name: 'Piplup',
                                expansionName: 'MEP Black Star Promos',
                                collectorNumber: 'MEP 043',
                                score: 800,
                            },
                        ],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Piplup (MEP 042)',
                url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
            },
            { tab: { id: 8, title: 'Piplup (MEP 042)', url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results[0].blueprint_id, 'mep-042');
    const extensionPayload = fetchBodies.find((entry) => entry.url.includes('/api/extension-card-search')).body;
    assert.equal(extensionPayload.name, 'Piplup');
    assert.equal(extensionPayload.collectorNumber, 'MEP 042');
    assert.equal(extensionPayload.expansion, 'MEP Black Star Promos');
});

test('Vinted background payload preserves Magnezone V and rejects ex results', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            {
                                cardId: 'magnezone-ex',
                                name: 'Magnezone ex',
                                expansionName: 'Scarlet Violet',
                                collectorNumber: '065/198',
                                score: 9999,
                            },
                            {
                                cardId: 'magnezone-v',
                                name: 'Magnezone V',
                                expansionName: 'Lost Origin',
                                collectorNumber: '056/196',
                                score: 20,
                            },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return { ok: true, json: async () => ({ rows: [] }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Magnezone V 056/196',
                originalTitle: 'Magnezone V 056/196',
                url: 'https://www.vinted.it/items/56-magnezone-v',
                clues: ['Magnezone V', 'V', '056/196'],
                primaryClues: ['Magnezone V', 'V'],
                selectedClues: ['Magnezone V', 'V', '056/196'],
                vintedPayload: {
                    source: 'vinted',
                    listingKey: 'https://www.vinted.it/items/56-magnezone-v',
                    originalTitle: 'Magnezone V 056/196',
                    searchTitle: 'Magnezone V 056/196',
                    primaryClues: ['Magnezone V', 'V'],
                    selectedClues: ['Magnezone V', 'V', '056/196'],
                    name: 'Magnezone',
                    variation: 'v',
                    collectorNumber: '056/196',
                    numericCollectorNumber: '056',
                    expansion: '',
                    features: [],
                    rarity: '',
                },
            },
            { tab: { id: 56, title: 'Magnezone V 056/196', url: 'https://www.vinted.it/items/56-magnezone-v' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.success, true, response.error || 'expected successful response');
    assert.deepEqual(Array.from(response.results.map((row) => row.blueprint_id)), ['magnezone-v']);
    const extensionPayload = fetchBodies.find((entry) => entry.url.includes('/api/extension-card-search')).body;
    assert.equal(extensionPayload.name, 'Magnezone v');
    assert.equal(extensionPayload.variation, 'v');
    assert.equal(extensionPayload.collectorNumber, '056/196');
});

test('Cardmarket Meowth POR 062 uses Perfect Order numeric exact payload and skips fallback', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                assert.equal(body.name, 'Meowth ex');
                assert.equal(body.collectorNumber, '062');
                assert.equal(body.printedCollectorNumber, 'POR 062');
                assert.equal(body.expansion, 'Perfect Order');
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            cardId: '378907',
                            name: 'Meowth ex',
                            expansionName: 'Perfect Order',
                            collectorNumber: 'Ultra Rare | 062/088',
                            score: 14830.5,
                        }],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                throw new Error('autocomplete should not run after exact Meowth match');
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Meowth ex (POR 062)',
                url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Equilibrio-Perfetto/Meowth-ex-POR062',
            },
            { tab: { id: 8, title: 'Meowth ex (POR 062)', url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Equilibrio-Perfetto/Meowth-ex-POR062' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].blueprint_id, '378907');
    assert.equal(response.results[0].collector_number, 'Ultra Rare | 062/088');
    assert.equal(response.results[0].expansion_name_en, 'Perfect Order');
    assert.equal(fetchBodies.filter((entry) => entry.url.includes('/api/extension-card-search')).length, 1);
    assert.equal(fetchBodies.some((entry) => entry.url.includes('/api/marketplace-autocomplete')), false);
});

test('Cardmarket Jirachi CP5 026 low exact candidates skip broad fill fallback', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                assert.equal(body.name, 'Jirachi');
                assert.equal(body.collectorNumber, 'CP5 026');
                assert.equal(body.numericCollectorNumber, '026');
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: 'jirachi-cp5-026-a', name: 'Jirachi', expansionName: 'Mythical & Legendary Dream Shine Collection', collectorNumber: '026/036', score: 100 },
                            { cardId: 'jirachi-cp5-026-b', name: 'Jirachi', expansionName: 'Mythical & Legendary Dream Shine Collection', collectorNumber: 'CP5 026', score: 90 },
                            { cardId: 'jirachi-cp5-026-c', name: 'Jirachi', expansionName: 'Mythical & Legendary Dream Shine Collection', collectorNumber: '026', score: 80 },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                throw new Error('autocomplete should not run to fill low exact Jirachi candidates');
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Jirachi (CP5 026)',
                url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Mythical-Legendary-Dream-Shine-Collection/Jirachi-CP5026',
            },
            { tab: { id: 8, title: 'Jirachi (CP5 026)', url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Mythical-Legendary-Dream-Shine-Collection/Jirachi-CP5026' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results.length, 1);
    assert.equal(response.results[0].blueprint_id, 'jirachi-cp5-026-b');
    assert.equal(fetchBodies.filter((entry) => entry.url.includes('/api/extension-card-search')).length, 1);
    assert.equal(fetchBodies.some((entry) => entry.url.includes('/api/marketplace-autocomplete')), false);
});

test('Cardmarket Meowth TR 62 exact Team Rocket match ends after exact phase', async () => {
    const source = readRepoFile('config/background.js');
    const fetchBodies = [];
    const storage = {};
    const storageWrites = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                assert.equal(body.name, 'Meowth');
                assert.equal(body.collectorNumber, '62');
                assert.equal(body.printedCollectorNumber, 'TR 62');
                assert.equal(body.expansion, 'Team Rocket');
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            {
                                cardId: 'meowth-po-062',
                                name: 'Meowth ex',
                                expansionName: 'Perfect Order',
                                collectorNumber: '062',
                                score: 9999,
                            },
                            {
                                cardId: 'meowth-tr-62',
                                name: 'Meowth',
                                expansionName: 'Team Rocket',
                                collectorNumber: '62/82',
                                score: 10,
                            },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                throw new Error('autocomplete should not run after strong Team Rocket exact match');
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: {
                        title: 'Meowth (TR 62)',
                        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Meowth-TR62',
                        hostname: 'www.cardmarket.com',
                        structuredCard: {
                            rawTitle: 'Meowth (TR 62)',
                            name: 'Meowth',
                            searchName: 'Meowth',
                            collectorNumber: 'TR 62',
                            collectorNumberPrefix: 'TR',
                            printedCollectorNumber: 'TR 62',
                            numericCollectorNumber: '62',
                            expansion: 'Team Rocket',
                        },
                    },
                }],
            },
            storage: {
                session: {
                    get: async () => storage,
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const result = await sandbox.resolveActiveTabForSidePanel({
        id: 8,
        title: 'Meowth (TR 62)',
        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Team-Rocket/Meowth-TR62',
    });

    assert.equal(result.blueprintId, 'meowth-tr-62');
    assert.equal(result.rows[0].card_id, 'meowth-tr-62');
    assert.equal(result.rows[0].name, 'Meowth');
    assert.equal(fetchBodies.filter((entry) => entry.url.includes('/api/extension-card-search')).length, 1);
    assert.equal(fetchBodies.some((entry) => entry.url.includes('/api/marketplace-autocomplete')), false);
    assert.ok(result.debug.phaseTimings.extensionSearchMs >= 0);
    assert.equal(result.debug.phaseTimings.nameResolutionMs, undefined);
    assert.equal(result.debug.phaseTimings.extensionSearchAfterResolutionMs, undefined);
    assert.equal(result.debug.phaseTimings.autocompleteFallbackMs, undefined);
    assert.equal(storageWrites.at(-1).blueprintId, 'meowth-tr-62');
});

test('exact name variation search skips autocomplete after extension match', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            const body = options.body ? JSON.parse(options.body) : {};
            fetchBodies.push({ url, body });
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                matches: [{
                            cardId: 'tornadus-ex',
                            name: 'Tornadus ex',
                            expansionName: 'BW Black Star Promos',
                            collectorNumber: 'BW96',
                            score: 99,
                        }],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                throw new Error('autocomplete should not run after exact variation match');
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Tornadus EX',
                url: 'https://www.vinted.it/items/8965119476-carte-pokemon-tornadus-ex-bw96-stamp-legendary-treasure',
            },
            { tab: { id: 8, title: 'Tornadus EX', url: 'https://www.vinted.it/items/8965119476-carte-pokemon-tornadus-ex-bw96-stamp-legendary-treasure' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results[0].blueprint_id, 'tornadus-ex');
    assert.equal(fetchBodies.filter((entry) => entry.url.includes('/api/extension-card-search')).length, 1);
    assert.equal(fetchBodies.some((entry) => entry.url.includes('/api/marketplace-autocomplete')), false);
    assert.equal(fetchBodies.find((entry) => entry.url.includes('/api/extension-card-search')).body.name, 'Tornadus ex');
});

test('Cardmarket exact rows survive name and fallback fetch failure', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async (url, options = {}) => {
            fetchBodies.push({ url, body: options.body ? JSON.parse(options.body) : {} });
            if (url.includes('/api/marketplace-blueprint-price')) {
                throw new TypeError('Failed to fetch');
            }
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            cardId: 'cinccino-cri-119',
                            name: 'Cinccino ex',
                            expansionName: 'Caos Nascente',
                            collectorNumber: '119',
                            score: 99,
                        }],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                throw new TypeError('Failed to fetch');
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: {
                        title: 'Cinccino ex (CRI 119)',
                        url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Caos-Nascente/Cinccino-ex-CRI119',
                        hostname: 'www.cardmarket.com',
                        structuredCard: {
                            rawTitle: 'Cinccino ex (CRI 119)',
                            name: 'Cinccino ex',
                            searchName: 'Cinccino ex',
                            collectorNumber: 'CRI 119',
                            collectorNumberPrefix: 'CRI',
                            printedCollectorNumber: 'CRI 119',
                            numericCollectorNumber: '119',
                            expansion: 'Caos Nascente',
                        },
                    },
                }],
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => Object.assign(storage, payload),
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const result = await sandbox.resolveActiveTabForSidePanel({
        id: 11,
        title: 'Cinccino ex (CRI 119)',
        url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Caos-Nascente/Cinccino-ex-CRI119',
    });

    assert.equal(result.blueprintId, 'cinccino-cri-119');
    assert.equal(result.rows.length, 1);
    assert.equal(result.error, '');
    assert.equal(fetchBodies.filter((entry) => entry.url.includes('/api/extension-card-search')).length, 1);
    assert.equal(fetchBodies.some((entry) => entry.url.includes('/api/marketplace-autocomplete')), false);
    assert.equal(storage.sidePanelState.blueprintId, 'cinccino-cri-119');
});

test('Cardmarket fallback fetch failure is terminal when no rows exist', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async (url) => {
            if (url.includes('/api/extension-card-search')) {
                return { ok: true, json: async () => ({ matches: [] }) };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                throw new TypeError('Failed to fetch');
            }
            if (url.includes('/api/marketplace-blueprint-price')) {
                throw new TypeError('Failed to fetch');
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: {
                        title: 'Unknownmon (CRI 999)',
                        url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Caos-Nascente/Unknownmon-CRI999',
                        hostname: 'www.cardmarket.com',
                        structuredCard: {
                            rawTitle: 'Unknownmon (CRI 999)',
                            name: 'Unknownmon',
                            searchName: 'Unknownmon',
                            collectorNumber: 'CRI 999',
                            numericCollectorNumber: '999',
                            expansion: 'Caos Nascente',
                        },
                    },
                }],
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => Object.assign(storage, payload),
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const result = await sandbox.resolveActiveTabForSidePanel({
        id: 11,
        title: 'Unknownmon (CRI 999)',
        url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Caos-Nascente/Unknownmon-CRI999',
    });

    assert.equal(result.rows.length, 0);
    assert.match(result.error, /Failed to fetch/);
    assert.equal(storage.sidePanelState.loading, undefined);
    assert.equal(storage.sidePanelState.rows.length, 0);
    assert.match(storage.sidePanelState.error, /Failed to fetch/);
});

test('name-only low candidate extension rows still use autocomplete fallback', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            const body = options.body ? JSON.parse(options.body) : {};
            fetchBodies.push({ url, body });
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [
                            { cardId: 'pikachu-name-1', name: 'Pikachu', expansionName: 'Scarlet & Violet', collectorNumber: '025', score: 50 },
                            { cardId: 'pikachu-name-2', name: 'Pikachu', expansionName: 'Base Set', collectorNumber: '58/102', score: 40 },
                            { cardId: 'pikachu-name-3', name: 'Pikachu', expansionName: 'Pokemon 151', collectorNumber: '025/165', score: 30 },
                        ],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return {
                    ok: true,
                    json: async () => ({
                        rows: body.search_term === 'Pikachu'
                            ? [{ card_id: 'pikachu-fallback', name: 'Pikachu', canonical_name: 'Pikachu', set_name: 'Pokemon 151', card_number: '025/165', search_rank: 999 }]
                            : [],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Pikachu',
                url: 'https://www.vinted.it/items/1-pikachu-card',
            },
            { tab: { id: 8, title: 'Pikachu', url: 'https://www.vinted.it/items/1-pikachu-card' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results[0].blueprint_id, 'pikachu-fallback');
    assert.equal(fetchBodies.filter((entry) => entry.url.includes('/api/extension-card-search')).length, 1);
    assert.equal(fetchBodies.some((entry) => entry.url.includes('/api/marketplace-autocomplete')), true);
});

test('background search response is not blocked by Cardmarket observation auth', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let bridgeOpened = false;
    let responseReceived = false;
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            cardId: 'mep-042',
                            name: 'Piplup',
                            expansionName: 'MEP Black Star Promos',
                            collectorNumber: 'MEP 042',
                            score: 99,
                        }],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                create: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 30));
                    bridgeOpened = true;
                    return { id: 99 };
                },
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async () => ({}),
                    set: async () => {},
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Piplup (MEP 042)',
                url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
            },
            { tab: { id: 8, title: 'Piplup (MEP 042)', url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042' } },
            (payload) => {
                responseReceived = true;
                assert.equal(bridgeOpened, false);
                resolve(payload);
            }
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results[0].blueprint_id, 'mep-042');
    assert.equal(responseReceived, true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(bridgeOpened, true);
});

test('Pokoin auth token response closes tracked auth bridge tab after storage and flush', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storageState = {
        pendingCardmarketObservations: [{
            signature: 'piplup|mep-042',
            payload: {
                structuredCard: { name: 'Piplup', collectorNumber: 'MEP 042' },
                cardmarketContext: { url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042' },
                match: { cardId: 'mep-042' },
            },
        }],
    };
    const removedTabs = [];
    const fetchCalls = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            fetchCalls.push({ url, options });
            return { ok: true, status: 200, json: async () => ({}) };
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                create: async () => ({ id: 99, windowId: 4, url: 'https://pokoin.com/extension/auth-bridge' }),
                get: async (tabId) => ({ id: tabId, windowId: 4, url: 'https://pokoin.com/extension/auth-bridge' }),
                remove: async (tabId) => {
                    removedTabs.push(tabId);
                },
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (keys) => {
                        if (Array.isArray(keys)) {
                            return Object.fromEntries(keys.map((key) => [key, storageState[key]]));
                        }
                        if (typeof keys === 'string') {
                            return { [keys]: storageState[keys] };
                        }
                        return { ...storageState };
                    },
                    set: async (payload) => {
                        Object.assign(storageState, payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const requestResponse = await new Promise((resolve) => {
        messageListener({ action: 'requestPokoinAuthToken' }, {}, resolve);
    });
    assert.equal(requestResponse.success, true);
    assert.equal(requestResponse.openedBridge, true);

    const tokenResponse = await new Promise((resolve) => {
        messageListener(
            {
                action: 'pokoinAuthTokenReceived',
                tokenMessage: {
                    type: 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE',
                    token: 'valid-firebase-id-token-value',
                    expiresAt: Date.now() + 600000,
                },
            },
            { tab: { id: 99, url: 'https://pokoin.com/extension/auth-bridge' } },
            resolve
        );
    });

    assert.equal(tokenResponse.success, true);
    assert.equal(storageState.pokoinAuthSession.token, 'valid-firebase-id-token-value');
    assert.equal(storageState.pendingCardmarketObservations.length, 0);
    assert.equal(fetchCalls.length, 1);
    assert.deepEqual(removedTabs, [99]);
});

test('Pokoin auth token response does not close tracked non-bridge Pokoin tab', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storageState = {};
    const removedTabs = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [{ id: 42, windowId: 5, url: 'https://pokoin.com/extension/auth-bridge' }],
                update: async () => ({ id: 42, windowId: 5, url: 'https://pokoin.com/extension/auth-bridge' }),
                get: async () => ({ id: 42, windowId: 5, url: 'https://pokoin.com/cards/mep-042' }),
                remove: async (tabId) => {
                    removedTabs.push(tabId);
                },
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (keys) => (typeof keys === 'string' ? { [keys]: storageState[keys] } : { ...storageState }),
                    set: async (payload) => {
                        Object.assign(storageState, payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    await new Promise((resolve) => {
        messageListener({ action: 'requestPokoinAuthToken' }, {}, resolve);
    });
    const tokenResponse = await new Promise((resolve) => {
        messageListener(
            {
                action: 'pokoinAuthTokenReceived',
                tokenMessage: {
                    type: 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE',
                    token: 'valid-firebase-id-token-value',
                    expiresAt: Date.now() + 600000,
                },
            },
            { tab: { id: 42, url: 'https://pokoin.com/extension/auth-bridge' } },
            resolve
        );
    });

    assert.equal(tokenResponse.success, true);
    assert.deepEqual(removedTabs, []);
});

test('concurrent Pokoin auth token requests close auth bridge tab once after token', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storageState = {};
    let createCount = 0;
    const removedTabs = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                create: async () => {
                    createCount += 1;
                    await new Promise((resolve) => setTimeout(resolve, 5));
                    return { id: 77, windowId: 3, url: 'https://pokoin.com/extension/auth-bridge' };
                },
                get: async () => ({ id: 77, windowId: 3, url: 'https://pokoin.com/extension/auth-bridge' }),
                remove: async (tabId) => {
                    removedTabs.push(tabId);
                },
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (keys) => (typeof keys === 'string' ? { [keys]: storageState[keys] } : { ...storageState }),
                    set: async (payload) => {
                        Object.assign(storageState, payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const [firstResponse, secondResponse] = await Promise.all([
        new Promise((resolve) => messageListener({ action: 'requestPokoinAuthToken' }, {}, resolve)),
        new Promise((resolve) => messageListener({ action: 'requestPokoinAuthToken' }, {}, resolve)),
    ]);
    assert.equal(firstResponse.success, true);
    assert.equal(secondResponse.success, true);
    assert.equal(createCount, 1);

    const tokenMessage = {
        action: 'pokoinAuthTokenReceived',
        tokenMessage: {
            type: 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE',
            token: 'valid-firebase-id-token-value',
            expiresAt: Date.now() + 600000,
        },
    };
    const [firstTokenResponse, secondTokenResponse] = await Promise.all([
        new Promise((resolve) => messageListener(tokenMessage, { tab: { id: 77, url: 'https://pokoin.com/extension/auth-bridge' } }, resolve)),
        new Promise((resolve) => messageListener(tokenMessage, { tab: { id: 77, url: 'https://pokoin.com/extension/auth-bridge' } }, resolve)),
    ]);

    assert.equal(firstTokenResponse.success, true);
    assert.equal(secondTokenResponse.success, true);
    assert.deepEqual(removedTabs, [77]);
});

test('invalid Pokoin auth token messages do not close auth bridge tab', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storageState = {};
    const removedTabs = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                create: async () => ({ id: 66, windowId: 2, url: 'https://pokoin.com/extension/auth-bridge' }),
                get: async () => ({ id: 66, windowId: 2, url: 'https://pokoin.com/extension/auth-bridge' }),
                remove: async (tabId) => {
                    removedTabs.push(tabId);
                },
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (keys) => (typeof keys === 'string' ? { [keys]: storageState[keys] } : { ...storageState }),
                    set: async (payload) => {
                        Object.assign(storageState, payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    await new Promise((resolve) => {
        messageListener({ action: 'requestPokoinAuthToken' }, {}, resolve);
    });
    const invalidResponse = await new Promise((resolve) => {
        messageListener(
            {
                action: 'pokoinAuthTokenReceived',
                tokenMessage: {
                    type: 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE',
                    token: 'short',
                    expiresAt: Date.now() + 600000,
                },
            },
            { tab: { id: 66, url: 'https://pokoin.com/extension/auth-bridge' } },
            resolve
        );
    });

    assert.equal(invalidResponse.success, false);
    assert.deepEqual(removedTabs, []);
});

test('Cardmarket Piplup fallback ranks MEP 042 above generic rows', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            cardId: 'sc-006',
                            name: 'Piplup',
                            expansionName: 'Stellar Crown',
                            collectorNumber: '006/142',
                            score: 9999,
                        }],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return {
                    ok: true,
                    json: async () => ({
                        rows: body.search_term === 'Piplup MEP 042'
                            ? [
                                { card_id: 'sc-006', name: 'Piplup', canonical_name: 'Piplup', set_name: 'Stellar Crown', card_number: '006/142', search_rank: 9999 },
                                { card_id: 'mep-042', name: 'Piplup', canonical_name: 'Piplup', set_name: 'MEP Black Star Promos', card_number: 'MEP 042', search_rank: 10 },
                                { card_id: 'c1-023', name: 'Piplup', canonical_name: 'Piplup', set_name: 'Collection X', card_number: '023', search_rank: 800 },
                            ]
                            : [],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Piplup (MEP 042)',
                url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
            },
            { tab: { id: 8, title: 'Piplup (MEP 042)', url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results[0].blueprint_id, 'mep-042');
    assert.equal(response.results[0].collector_number, 'MEP 042');
    assert.equal(response.results[0].expansion_name_en, 'MEP Black Star Promos');
    assert.ok(fetchBodies.some((entry) => entry.body.search_term === 'Piplup MEP 042'));
});

test('Cardmarket Piplup fallback queries include collector before promo expansion', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            cardId: 'wrong',
                            name: 'Piplup',
                            expansionName: 'Stellar Crown',
                            collectorNumber: '006/142',
                            score: 9999,
                        }],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return {
                    ok: true,
                    json: async () => ({
                        rows: body.search_term === 'Piplup MEP 042 MEP Black Star Promos'
                            ? [{ card_id: 'mep-042', name: 'Piplup', canonical_name: 'Piplup', set_name: 'MEP Black Star Promos', card_number: 'MEP 042', search_rank: 1 }]
                            : [],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Piplup (MEP 042)',
                url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
            },
            { tab: { id: 8, title: 'Piplup (MEP 042)', url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results[0].blueprint_id, 'mep-042');
    const fallbackQueries = fetchBodies
        .filter((entry) => entry.url.includes('/api/marketplace-autocomplete'))
        .map((entry) => entry.body.search_term);
    assert.ok(fallbackQueries.includes('Piplup MEP 042'));
    assert.ok(fallbackQueries.includes('Piplup MEP 042 MEP Black Star Promos'));
    assert.ok(
        fallbackQueries.indexOf('Piplup MEP 042') <
        fallbackQueries.indexOf('Piplup MEP 042 MEP Black Star Promos')
    );
});

test('Cardmarket background search prefers trainer composite over shorter Pokemon match', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchBodies = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return {
                    ok: true,
                    json: async () => ({ products: [] }),
                };
            }
            const body = JSON.parse(options.body || '{}');
            fetchBodies.push({ url, body });
            if (url.includes('/api/marketplace-autocomplete')) {
                return {
                    ok: true,
                    json: async () => ({
                        rows: body.search_term === 'Arven\'s Mabosstiff ex'
                            ? [{ card_id: '484', name: 'Arven\'s Mabosstiff ex', canonical_name: 'Arven\'s Mabosstiff ex', search_rank: 100 }]
                            : body.search_term === 'Mabosstiff'
                                ? [{ card_id: '999', name: 'Mabosstiff', canonical_name: 'Mabosstiff', search_rank: 100 }]
                                : [],
                    }),
                };
            }
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: /^Arven's Mabosstiff ex\b/.test(body.name || '')
                            ? [{
                                cardId: '484',
                                name: 'Arven\'s Mabosstiff ex',
                                expansionName: 'Mega Evolution',
                                collectorNumber: '484',
                                score: 95,
                            }]
                            : [{
                                cardId: '999',
                                name: 'Mabosstiff',
                                expansionName: 'Mega Evolution',
                                collectorNumber: '123',
                                score: 95,
                            }],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                title: 'Arven\'s Mabosstiff ex (mC 484)',
                url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Mega-Evolution/Arvens-Mabosstiff-ex-mC484',
            },
            { tab: { id: 8, title: 'Arven\'s Mabosstiff ex (mC 484)', url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Mega-Evolution/Arvens-Mabosstiff-ex-mC484' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results[0].name_en, 'Arven\'s Mabosstiff ex');
    const extensionPayload = fetchBodies.find((entry) => entry.url.includes('/api/extension-card-search')).body;
    assert.equal(extensionPayload.name, 'Arven\'s Mabosstiff ex');
    assert.equal(extensionPayload.collectorNumber, 'MC 484');
});

test('background marketplace search preserves trainer composite names across sites', async () => {
    for (const { label, url, title, originalTitle, clues, primaryClues } of [
        {
            label: 'Vinted',
            url: 'https://www.vinted.it/items/35-arven-mabosstiff',
            title: 'Arven\'s Mabosstiff ex',
            originalTitle: 'Pokemon card Mabosstiff ex',
            clues: ['Arven\'s Mabosstiff ex', 'Mabosstiff ex', 'ex'],
            primaryClues: ['Arven\'s Mabosstiff ex', 'ex'],
        },
        {
            label: 'eBay',
            url: 'https://www.ebay.com/itm/123456',
            title: 'Pokemon TCG Arven\'s Mabosstiff ex 484',
            originalTitle: '',
            clues: [],
            primaryClues: [],
        },
    ]) {
        const source = readRepoFile('config/background.js');
        let messageListener = null;
        const fetchBodies = [];
        const sandbox = {
            console: { log() {}, warn() {}, error() {} },
            URL,
            setTimeout,
            clearTimeout,
            fetch: async (fetchUrl, options = {}) => {
                if (fetchUrl.includes('/api/marketplace-blueprint-price')) {
                    return {
                        ok: true,
                        json: async () => ({ products: [] }),
                    };
                }
                const body = JSON.parse(options.body || '{}');
                fetchBodies.push({ url: fetchUrl, body });
                if (fetchUrl.includes('/api/marketplace-autocomplete')) {
                    return {
                        ok: true,
                        json: async () => ({
                            rows: body.search_term === 'Arven\'s Mabosstiff ex'
                                ? [{ card_id: '484', name: 'Arven\'s Mabosstiff ex', canonical_name: 'Arven\'s Mabosstiff ex', search_rank: 100 }]
                                : body.search_term === 'Mabosstiff'
                                    ? [{ card_id: '999', name: 'Mabosstiff', canonical_name: 'Mabosstiff', search_rank: 100 }]
                                    : [],
                        }),
                    };
                }
                if (fetchUrl.includes('/api/extension-card-search')) {
                    return {
                        ok: true,
                        json: async () => ({
                            matches: /^Arven's Mabosstiff ex\b/.test(body.name || '')
                                ? [{
                                    cardId: '484',
                                    name: 'Arven\'s Mabosstiff ex',
                                    expansionName: 'Mega Evolution',
                                    collectorNumber: '484',
                                    score: 95,
                                }]
                                : [{
                                    cardId: '999',
                                    name: 'Mabosstiff',
                                    expansionName: 'Mega Evolution',
                                    collectorNumber: '123',
                                    score: 95,
                                }],
                        }),
                    };
                }
                throw new Error(`Unexpected fetch: ${fetchUrl}`);
            },
            chrome: {
                runtime: {
                    onMessage: {
                        addListener(listener) {
                            messageListener = listener;
                        },
                    },
                    onInstalled: { addListener() {} },
                    onStartup: { addListener() {} },
                },
                tabs: {
                    query: async () => [],
                    onUpdated: { addListener() {} },
                    onActivated: { addListener() {} },
                },
                scripting: { executeScript: async () => [] },
                storage: {
                    session: { get: async () => ({}), set: async () => {} },
                    local: { set: async () => {} },
                },
                sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
                action: { setIcon: async () => {}, onClicked: { addListener() {} } },
            },
        };
        vm.createContext(sandbox);
        vm.runInContext(source, sandbox, { filename: `config/background.js:${label}` });

        const response = await new Promise((resolve) => {
            messageListener(
                {
                    action: 'searchCardForTitle',
                    title,
                    originalTitle,
                    clues,
                    primaryClues,
                    url,
                },
                { tab: { id: 8, title: originalTitle || title, url } },
                resolve
            );
        });

        assert.equal(response.success, true, `${label} response should succeed`);
        assert.equal(response.results[0].name_en, 'Arven\'s Mabosstiff ex', `${label} should return composite card name`);
        const firstAutocompleteBody = fetchBodies.find((entry) => entry.url.includes('/api/marketplace-autocomplete'))?.body || {};
        assert.equal(firstAutocompleteBody.search_term, 'Arven\'s Mabosstiff ex', `${label} should resolve composite name before Pokemon-only fallback`);
        const extensionPayload = fetchBodies.find((entry) => entry.url.includes('/api/extension-card-search')).body;
        assert.equal(extensionPayload.name, 'Arven\'s Mabosstiff ex', `${label} extension search should use composite card name`);
    }
});

test('background search de-dupes repeated identical title requests', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let fetchCalls = 0;
    let releaseFetch;
    const fetchGate = new Promise((resolve) => {
        releaseFetch = resolve;
    });
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            fetchCalls += 1;
            await fetchGate;
            if (url.includes('/api/marketplace-blueprint-price')) {
                return {
                    ok: true,
                    json: async () => ({ products: [] }),
                };
            }
            const body = JSON.parse(options.body || '{}');
            if (url.includes('/api/marketplace-autocomplete')) {
                return {
                    ok: true,
                    json: async () => ({
                        rows: body.search_term === 'Reshiram'
                            ? [{ card_id: '1', name: 'Reshiram', canonical_name: 'Reshiram', search_rank: 99 }]
                            : [],
                    }),
                };
            }
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            cardId: '1',
                            name: 'Reshiram',
                            expansionName: 'Black White',
                            collectorNumber: 'SWSH154',
                            score: 95,
                        }],
                    }),
                };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const request = {
        action: 'searchCardForTitle',
        title: 'Reshiram',
        originalTitle: 'Carta Pokemon Reshiram',
        clues: ['Reshiram'],
        primaryClues: ['Reshiram'],
        url: 'https://www.vinted.it/items/20-reshiram?ref=feed#photo',
    };
    const sender = { tab: { id: 8, title: 'Carta Pokemon Reshiram', url: request.url } };
    const firstResponse = new Promise((resolve) => messageListener(request, sender, resolve));
    const secondResponse = new Promise((resolve) => messageListener({ ...request, url: 'https://www.vinted.it/items/20-reshiram?foo=bar' }, sender, resolve));
    releaseFetch();
    const responses = await Promise.all([firstResponse, secondResponse]);

    assert.equal(responses[0].success, true);
    assert.equal(responses[1].success, true);
    assert.equal(responses[0].results[0].name_en, 'Reshiram');
    assert.equal(responses[1].results[0].name_en, 'Reshiram');
    assert.equal(fetchCalls, 5, 'token prediction, name resolution, structured search, fallback autocomplete, and async price enrichment should run once for duplicate requests');
});

test('background side panel open honors selected Vinted candidate without reordering search', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let fetchCalls = 0;
    const storageWrites = [];
    const openedPanels = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            fetchCalls += 1;
            throw new Error('selected candidate path should not search');
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({ id: 8, title: 'Carta Pokemon Regigigas Vastro', url: 'https://www.vinted.it/items/70-regigigas' }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('selected candidate path should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({}),
                    set: async (payload) => {
                        storageWrites.push(payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async (payload) => openedPanels.push(payload),
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'openSidePanelForCurrentTab',
                url: 'https://www.vinted.it/items/70-regigigas',
                title: 'Regigigas vstar',
                originalTitle: 'Carta Pokemon Regigigas Vastro',
                clues: ['Regigigas', 'vstar'],
                primaryClues: ['Regigigas', 'vstar'],
                selectedCandidateId: '9876',
                selectedCandidate: {
                    card_id: '9876',
                    name: 'Regigigas VSTAR',
                    set_name: 'Astral Radiance',
                    card_number: '114/189',
                },
            },
            { tab: { id: 8, title: 'Carta Pokemon Regigigas Vastro', url: 'https://www.vinted.it/items/70-regigigas' } },
            resolve
        );
    });

    const finalState = storageWrites.at(-1).sidePanelState;
    assert.equal(response.success, true);
    assert.deepEqual(openedPanels.map((panel) => panel.tabId), [8]);
    assert.equal(openedPanels.length, 1, 'open should be requested once for the sender tab');
    assert.equal(fetchCalls, 0);
    assert.equal(finalState.blueprintId, '9876');
    assert.equal(finalState.best.name, 'Regigigas VSTAR');
    assert.deepEqual(finalState.pageInfo.clues, ['Regigigas', 'vstar']);
    assert.equal(finalState.debug.selectedCandidateId, '9876');
});

test('background side panel open pins Vinted preview rows and clues', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let fetchCalls = 0;
    const storageWrites = [];
    const openedPanels = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            fetchCalls += 1;
            throw new Error('preview row path should not search before painting side panel');
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({ id: 9, title: 'Tornadus EX Full Art', url: 'https://www.vinted.it/items/91-tornadus' }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('preview row path should not scrape before painting side panel');
                },
            },
            storage: {
                session: {
                    get: async () => ({}),
                    set: async (payload) => {
                        storageWrites.push(payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async (payload) => openedPanels.push(payload),
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'openSidePanelForCurrentTab',
                url: 'https://www.vinted.it/items/91-tornadus',
                title: 'Tornadus ex illustration',
                originalTitle: 'Tornadus EX Full Art',
                clues: ['Tornadus ex', 'ex', 'illustration'],
                primaryClues: ['Tornadus ex', 'ex'],
                previewSignature: 'vinted|tornadusexillustration',
                previewRows: [
                    { card_id: '96', name: 'Tornadus EX', set_name: 'BW Black Star Promos', card_number: '96', search_rank: 99, pokoin_price: '$1.00', previewImageUrl: 'https://cdn.pokoin.com/previews/96_tornadus.jpg' },
                    { card_id: '90', name: 'Tornadus EX', set_name: 'Dark Explorers', card_number: '90', search_rank: 95, pokoin_price: '$2.00' },
                ],
            },
            { tab: { id: 9, title: 'Tornadus EX Full Art', url: 'https://www.vinted.it/items/91-tornadus' } },
            resolve
        );
    });

    const finalState = storageWrites.at(-1).sidePanelState;
    assert.equal(response.success, true);
    assert.deepEqual(openedPanels.map((panel) => panel.tabId), [9]);
    assert.equal(fetchCalls, 0);
    assert.deepEqual(finalState.rows.map((row) => row.card_id), ['96', '90']);
    assert.deepEqual(finalState.rows.map((row) => row.set_name), ['BW Black Star Promos', 'Dark Explorers']);
    assert.equal(finalState.rows[0].preview_image_url, 'https://cdn.pokoin.com/previews/96_tornadus.jpg');
    assert.equal(finalState.blueprintId, '96');
    assert.deepEqual(finalState.pageInfo.clues, ['Tornadus ex', 'ex', 'illustration']);
    assert.deepEqual(finalState.pageInfo.primaryClues, ['Tornadus ex', 'ex']);
    assert.equal(finalState.debug.pinnedVintedPreview, true);
});

test('background side panel open pins eBay preview rows', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let fetchCalls = 0;
    const storageWrites = [];
    const openedPanels = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            fetchCalls += 1;
            throw new Error('eBay preview row path should not search before painting side panel');
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({ id: 10, title: 'Tornadus EX Full Art Pokemon', url: 'https://www.ebay.com/itm/555-tornadus-ex' }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('eBay preview row path should not scrape before painting side panel');
                },
            },
            storage: {
                session: {
                    get: async () => ({}),
                    set: async (payload) => {
                        storageWrites.push(payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async (payload) => openedPanels.push(payload),
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'openSidePanelForCurrentTab',
                url: 'https://www.ebay.com/itm/555-tornadus-ex',
                title: 'Tornadus EX Full Art Pokemon',
                previewSignature: 'ebay|https://www.ebay.com/itm/555-tornadus-ex',
                previewRows: [
                    { card_id: '96', name: 'Tornadus EX', set_name: 'BW Black Star Promos', card_number: '96', search_rank: 99, pokoin_price: '$1.00' },
                    { card_id: '90', name: 'Tornadus EX', set_name: 'Dark Explorers', card_number: '90', search_rank: 95, pokoin_price: '$2.00' },
                ],
            },
            { tab: { id: 10, title: 'Tornadus EX Full Art Pokemon', url: 'https://www.ebay.com/itm/555-tornadus-ex' } },
            resolve
        );
    });

    const finalState = storageWrites.at(-1).sidePanelState;
    assert.equal(response.success, true);
    assert.deepEqual(openedPanels.map((panel) => panel.tabId), [10]);
    assert.equal(fetchCalls, 0);
    assert.deepEqual(finalState.rows.map((row) => row.card_id), ['96', '90']);
    assert.equal(finalState.blueprintId, '96');
    assert.equal(finalState.debug.pinnedPreviewRows, true);
    assert.equal(finalState.debug.previewSignature, 'ebay|https://www.ebay.com/itm/555-tornadus-ex');
});

test('background side panel open pins Cardmarket preview rows after button match', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let fetchCalls = 0;
    const storageWrites = [];
    const openedPanels = [];
    const cardmarketUrl = 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Caos-Nascente/Cinccino-ex-CRI119';
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            fetchCalls += 1;
            throw new TypeError('Failed to fetch');
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({ id: 11, title: 'Cinccino ex (CRI 119)', url: cardmarketUrl }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('Cardmarket preview row path should not scrape before painting side panel');
                },
            },
            storage: {
                session: {
                    get: async () => ({}),
                    set: async (payload) => {
                        storageWrites.push(payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async (payload) => openedPanels.push(payload),
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'openSidePanelForCurrentTab',
                url: cardmarketUrl,
                title: 'Cinccino ex (CRI 119)',
                originalTitle: 'Cinccino ex (CRI 119)',
                clues: ['CRI 119', 'Caos Nascente'],
                previewSignature: `cardmarket|${cardmarketUrl}`,
                previewSource: 'cardmarket_button',
                previewRows: [
                    { blueprint_id: 'cinccino-cri-119', name_en: 'Cinccino ex', expansion_name_en: 'Caos Nascente', collector_number: '119', search_score: 99 },
                ],
            },
            { tab: { id: 11, title: 'Cinccino ex (CRI 119)', url: cardmarketUrl } },
            resolve
        );
    });

    const finalState = storageWrites.at(-1).sidePanelState;
    assert.equal(response.success, true);
    assert.deepEqual(openedPanels.map((panel) => panel.tabId), [11]);
    assert.equal(fetchCalls, 1);
    assert.equal(finalState.blueprintId, 'cinccino-cri-119');
    assert.deepEqual(finalState.rows.map((row) => row.card_id), ['cinccino-cri-119']);
    assert.equal(finalState.debug.pinnedPreviewRows, true);
    assert.equal(finalState.debug.previewSource, 'cardmarket_button');
    assert.equal(finalState.error, '');
});

test('Cardmarket side panel refresh clears loading after search failure', async () => {
    const source = readRepoFile('config/background.js');
    const storageWrites = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            throw new Error('network down');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: {
                        title: 'Camerupt (ASC 028)',
                        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Ascended-Heroes/Camerupt-ASC028',
                        hostname: 'www.cardmarket.com',
                        structuredCard: {
                            rawTitle: 'Camerupt (ASC 028)',
                            name: 'Camerupt',
                            searchName: 'Camerupt',
                            collectorNumber: '028',
                            expansion: 'Ascended Heroes',
                        },
                    },
                }],
            },
            storage: {
                session: {
                    get: async () => ({}),
                    set: async (payload) => {
                        storageWrites.push(payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const result = await sandbox.resolveActiveTabForSidePanel({
        id: 8,
        title: 'Camerupt (ASC 028)',
        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Ascended-Heroes/Camerupt-ASC028',
    });

    const finalState = storageWrites.at(-1).sidePanelState;
    assert.equal(result.rows.length, 0);
    assert.equal(finalState.loading, undefined);
    assert.equal(finalState.error, 'network down');
    assert.equal(finalState.rows.length, 0);
});

test('Cardmarket stale Red Card refresh cannot overwrite newer Piplup page state', async () => {
    const source = readRepoFile('config/background.js');
    const storageWrites = [];
    const piplupUrl = 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042';
    const staleRedCardUrl = 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Holo-McDonalds/Red-Card-HMD012';
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            cardId: 'red-card',
                            name: 'Red Card',
                            expansionName: 'Holo McDonalds',
                            collectorNumber: '012',
                            score: 99,
                        }],
                    }),
                };
            }
            if (url.includes('/api/marketplace-autocomplete')) {
                return { ok: true, json: async () => ({ rows: [] }) };
            }
            throw new Error(`Unexpected fetch: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: {
                        title: 'Red Card (HMD 012)',
                        url: staleRedCardUrl,
                        hostname: 'www.cardmarket.com',
                        structuredCard: {
                            rawTitle: 'Red Card (HMD 012)',
                            name: 'Red Card',
                            searchName: 'Red Card',
                            collectorNumber: 'HMD 012',
                            numericCollectorNumber: '012',
                            expansion: 'Holo McDonalds',
                        },
                    },
                }],
            },
            storage: {
                session: {
                    get: async () => ({
                        pokoinExtensionRuntime: { buildMarker: '2.0.0-runtime-divergence-guard' },
                        sidePanelState: {
                            updatedAt: Date.now() + 1000,
                            pageInfo: {
                                title: 'Piplup (MEP 042)',
                                url: piplupUrl,
                            },
                            rows: [{
                                card_id: 'mep-042',
                                name: 'Piplup',
                                set_name: 'MEP Black Star Promos',
                                card_number: 'MEP 042',
                            }],
                            best: { card_id: 'mep-042', name: 'Piplup' },
                            blueprintId: 'mep-042',
                        },
                    }),
                    set: async (payload) => {
                        if (payload.sidePanelState) {
                            storageWrites.push(payload);
                        }
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const result = await sandbox.resolveActiveTabForSidePanel({
        id: 8,
        title: 'Red Card (HMD 012)',
        url: staleRedCardUrl,
    });

    assert.equal(result.stale, true);
    assert.equal(result.pageInfo.structuredCard.name, 'Red Card');
    assert.equal(storageWrites.length, 0, 'stale Red Card result must not write sidePanelState over Piplup');
});

test('background side panel owner prevents slow old tab search overwriting newer active tab', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    const storageWrites = [];
    let redSearchRelease;
    const redSearchStarted = new Promise((resolve) => {
        redSearchRelease = () => resolve({
            ok: true,
            json: async () => ({
                matches: [{ cardId: 'red-card', name: 'Red Card', expansionName: 'Holo McDonalds', collectorNumber: '012', score: 99 }],
            }),
        });
    });
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            if (url.includes('/api/extension-card-search')) {
                const body = JSON.parse(options.body || '{}');
                if (/red card/i.test(body.name || '')) {
                    return redSearchStarted;
                }
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{ cardId: 'piplup', name: 'Piplup', expansionName: 'MEP Black Star Promos', collectorNumber: 'MEP 042', score: 100 }],
                    }),
                };
            }
            return { ok: true, json: async () => ({ rows: [] }) };
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async (options) => {
                    const tabId = options?.target?.tabId;
                    const tab = tabId === 1
                        ? {
                            title: 'Red Card (HMD 012)',
                            url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Holo-McDonalds/Red-Card-HMD012',
                            structuredCard: {
                                rawTitle: 'Red Card (HMD 012)',
                                name: 'Red Card',
                                searchName: 'Red Card',
                                collectorNumber: 'HMD 012',
                                numericCollectorNumber: '012',
                                expansion: 'Holo McDonalds',
                            },
                        }
                        : {
                            title: 'Piplup (MEP 042)',
                            url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
                            structuredCard: {
                                rawTitle: 'Piplup (MEP 042)',
                                name: 'Piplup',
                                searchName: 'Piplup',
                                collectorNumber: 'MEP 042',
                                numericCollectorNumber: '042',
                                expansion: 'MEP Black Star Promos',
                            },
                        };
                    return [{
                        result: {
                            ...tab,
                            hostname: 'www.cardmarket.com',
                        },
                    }];
                },
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (Array.isArray(key)) {
                            return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        }
                        if (typeof key === 'string') {
                            return { [key]: storage[key] };
                        }
                        return { ...storage };
                    },
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) {
                            storageWrites.push(payload.sidePanelState);
                        }
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel; this.createSidePanelRequestOwner = createSidePanelRequestOwner;`, sandbox, { filename: 'config/background.js' });

    const redTab = {
        id: 1,
        title: 'Red Card (HMD 012)',
        url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Holo-McDonalds/Red-Card-HMD012',
    };
    const piplupTab = {
        id: 2,
        title: 'Piplup (MEP 042)',
        url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
    };
    const redOwner = sandbox.createSidePanelRequestOwner(redTab, 'activated');
    const slowRed = sandbox.resolveActiveTabForSidePanel(redTab, { expectedUrl: redTab.url, owner: redOwner });
    await Promise.resolve();
    const piplupOwner = sandbox.createSidePanelRequestOwner(piplupTab, 'activated');
    const piplupResult = await sandbox.resolveActiveTabForSidePanel(piplupTab, { expectedUrl: piplupTab.url, owner: piplupOwner });
    redSearchRelease();
    const redResult = await slowRed;

    assert.equal(piplupResult.blueprintId, 'piplup');
    assert.equal(redResult.stale, true);
    assert.equal(storage.sidePanelState.blueprintId, 'piplup');
    assert.equal(storage.sidePanelState.pageInfo.title, 'Piplup (MEP 042)');
    assert.ok(storage.sidePanelState.debug.sidePanelRequestId > 0);
    assert.equal(storageWrites.at(-1).blueprintId, 'piplup');
});

test('background URL change owner prevents prior same-tab URL search overwrite', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    const storageWrites = [];
    let firstSearchRelease;
    const firstSearch = new Promise((resolve) => {
        firstSearchRelease = () => resolve({
            ok: true,
            json: async () => ({
                matches: [{ cardId: 'old-url', name: 'Camerupt', expansionName: 'Ascended Heroes', collectorNumber: '028', score: 95 }],
            }),
        });
    });
    const oldUrl = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Ascended-Heroes/Camerupt-ASC028';
    const newUrl = 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042';
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        currentScrapeUrl: oldUrl,
        fetch: async (url, options = {}) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            if (url.includes('/api/extension-card-search')) {
                const body = JSON.parse(options.body || '{}');
                if (/camerupt/i.test(body.name || '')) return firstSearch;
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{ cardId: 'new-url', name: 'Piplup', expansionName: 'MEP Black Star Promos', collectorNumber: 'MEP 042', score: 100 }],
                    }),
                };
            }
            return { ok: true, json: async () => ({ rows: [] }) };
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: sandbox.currentScrapeUrl === oldUrl
                        ? {
                            title: 'Camerupt (ASC 028)',
                            url: oldUrl,
                            hostname: 'www.cardmarket.com',
                            structuredCard: {
                                rawTitle: 'Camerupt (ASC 028)',
                                name: 'Camerupt',
                                searchName: 'Camerupt',
                                collectorNumber: 'ASC 028',
                                numericCollectorNumber: '028',
                                expansion: 'Ascended Heroes',
                            },
                        }
                        : {
                            title: 'Piplup (MEP 042)',
                            url: newUrl,
                            hostname: 'www.cardmarket.com',
                            structuredCard: {
                                rawTitle: 'Piplup (MEP 042)',
                                name: 'Piplup',
                                searchName: 'Piplup',
                                collectorNumber: 'MEP 042',
                                numericCollectorNumber: '042',
                                expansion: 'MEP Black Star Promos',
                            },
                        },
                }],
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel; this.createSidePanelRequestOwner = createSidePanelRequestOwner;`, sandbox, { filename: 'config/background.js' });

    const oldTab = { id: 8, title: 'Camerupt (ASC 028)', url: oldUrl };
    const newTab = { id: 8, title: 'Piplup (MEP 042)', url: newUrl };
    const oldOwner = sandbox.createSidePanelRequestOwner(oldTab, 'tab-url');
    const oldResultPromise = sandbox.resolveActiveTabForSidePanel(oldTab, { expectedUrl: oldTab.url, owner: oldOwner });
    await Promise.resolve();
    sandbox.currentScrapeUrl = newUrl;
    const newOwner = sandbox.createSidePanelRequestOwner(newTab, 'tab-url');
    await sandbox.resolveActiveTabForSidePanel(newTab, { expectedUrl: newTab.url, owner: newOwner });
    firstSearchRelease();
    const oldResult = await oldResultPromise;

    assert.equal(oldResult.stale, true);
    assert.equal(storage.sidePanelState.blueprintId, 'new-url');
    assert.equal(storage.sidePanelState.pageInfo.url, newTab.url);
    assert.equal(storageWrites.at(-1).blueprintId, 'new-url');
});

test('background latest same-tab side panel request writes when current', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    const storageWrites = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async (url) => {
            if (url.includes('/api/marketplace-blueprint-price')) return { ok: true, json: async () => ({ products: [] }) };
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{ cardId: 'latest', name: 'Piplup', expansionName: 'MEP Black Star Promos', collectorNumber: 'MEP 042', score: 100 }],
                    }),
                };
            }
            return { ok: true, json: async () => ({ rows: [] }) };
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: {
                        title: 'Piplup (MEP 042)',
                        url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
                        hostname: 'www.cardmarket.com',
                        structuredCard: {
                            rawTitle: 'Piplup (MEP 042)',
                            name: 'Piplup',
                            searchName: 'Piplup',
                            collectorNumber: 'MEP 042',
                            numericCollectorNumber: '042',
                            expansion: 'MEP Black Star Promos',
                        },
                    },
                }],
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel; this.createSidePanelRequestOwner = createSidePanelRequestOwner;`, sandbox, { filename: 'config/background.js' });

    const tab = {
        id: 8,
        title: 'Piplup (MEP 042)',
        url: 'https://www.cardmarket.com/it/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
    };
    const owner = sandbox.createSidePanelRequestOwner(tab, 'open');
    const result = await sandbox.resolveActiveTabForSidePanel(tab, { expectedUrl: tab.url, owner });

    assert.notEqual(result.stale, true);
    assert.equal(storage.sidePanelState.blueprintId, 'latest');
    assert.equal(storage.sidePanelState.debug.sidePanelRequestId, owner.requestId);
    assert.equal(storageWrites.length, 1);
});

test('CardTrader direct side-panel open remains immediate with request owner', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let fetchCalls = 0;
    const storageWrites = [];
    const openedPanels = [];
    const cardTraderUrl = 'https://www.cardtrader.com/cards/12345-hypno';
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async () => {
            fetchCalls += 1;
            throw new Error('CardTrader direct open should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({ id: 55, title: 'Hypno | CardTrader', url: cardTraderUrl }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('CardTrader direct open should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({}),
                    set: async (payload) => {
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async (payload) => openedPanels.push(payload),
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            { action: 'openSidePanelForCurrentTab', url: cardTraderUrl, title: 'Hypno | CardTrader' },
            { tab: { id: 55, title: 'Hypno | CardTrader', url: cardTraderUrl } },
            resolve
        );
    });

    const finalState = storageWrites.at(-1);
    assert.equal(response.success, true);
    assert.equal(fetchCalls, 0);
    assert.equal(openedPanels.length, 1);
    assert.equal(openedPanels[0].tabId, 55);
    assert.equal(finalState.blueprintId, '12345');
    assert.equal(finalState.debug.directCardTrader, true);
    assert.equal(finalState.debug.sidePanelReason, 'open');
});

test('stale broad refresh cannot overwrite Vinted pinned preview rows', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    const storageWrites = [];
    let messageListener = null;
    const vintedUrl = 'https://www.vinted.it/items/91-tornadus';
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async (url) => {
            if (url.includes('/api/marketplace-blueprint-price')) return { ok: true, json: async () => ({ products: [] }) };
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{ cardId: 'broad', name: 'Tornadus', expansionName: 'Generic Set', collectorNumber: '1', score: 90 }],
                    }),
                };
            }
            return { ok: true, json: async () => ({ rows: [] }) };
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({ id: 9, title: 'Tornadus EX Full Art', url: vintedUrl }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: {
                        title: 'Tornadus',
                        url: vintedUrl,
                        hostname: 'www.vinted.it',
                        structuredCard: { rawTitle: 'Tornadus', name: 'Tornadus', searchName: 'Tornadus' },
                    },
                }],
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async () => {},
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel; this.createSidePanelRequestOwner = createSidePanelRequestOwner;`, sandbox, { filename: 'config/background.js' });

    await new Promise((resolve) => {
        messageListener(
            {
                action: 'openSidePanelForCurrentTab',
                url: vintedUrl,
                title: 'Tornadus ex illustration',
                originalTitle: 'Tornadus EX Full Art',
                clues: ['Tornadus ex', 'ex', 'illustration'],
                primaryClues: ['Tornadus ex', 'ex'],
                previewSignature: 'vinted|tornadusexillustration',
                previewSource: 'vinted_overlay',
                previewRows: [
                    { card_id: '96', name: 'Tornadus EX', set_name: 'BW Black Star Promos', card_number: '96', search_rank: 99 },
                    { card_id: '90', name: 'Tornadus EX', set_name: 'Dark Explorers', card_number: '90', search_rank: 95 },
                ],
            },
            { tab: { id: 9, title: 'Tornadus EX Full Art', url: vintedUrl } },
            resolve
        );
    });

    const broadOwner = sandbox.createSidePanelRequestOwner({ id: 9, title: 'Tornadus EX Full Art', url: vintedUrl }, 'tab-complete');
    const broadResult = await sandbox.resolveActiveTabForSidePanel({ id: 9, title: 'Tornadus EX Full Art', url: vintedUrl }, { expectedUrl: vintedUrl, owner: broadOwner });

    assert.equal(broadResult.blueprintId, '96');
    assert.deepEqual(storage.sidePanelState.rows.map((row) => row.card_id), ['96', '90']);
    assert.equal(storage.sidePanelState.debug.pinnedPreviewRows, true);
    assert.equal(storage.sidePanelState.debug.previewSource, 'vinted_overlay');
    assert.deepEqual(storageWrites.at(-1).rows.map((row) => row.card_id), ['96', '90']);
});

test('background Vinted preview state prefers structured payload over reparsed title', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    let messageListener = null;
    const vintedUrl = 'https://www.vinted.it/items/194-lapras';
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async (url) => {
            if (url.includes('/api/marketplace-blueprint-price')) return { ok: true, json: async () => ({ products: [] }) };
            return { ok: true, json: async () => ({ rows: [] }) };
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({ id: 10, title: 'Pokemon carta Lapras it 194', url: vintedUrl }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => { throw new Error('structured payload should avoid broad scrape'); } },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => Object.assign(storage, payload),
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async () => {},
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'openSidePanelForCurrentTab',
                url: vintedUrl,
                title: 'Lapras 194',
                originalTitle: 'Pokemon carta Lapras it 194',
                clues: ['Lapras', '194'],
                primaryClues: ['Lapras'],
                selectedClues: ['Lapras', '194'],
                vintedPayload: {
                    source: 'vinted',
                    originalTitle: 'Pokemon carta Lapras it 194',
                    searchTitle: 'Lapras 194',
                    primaryClues: ['Lapras'],
                    selectedClues: ['Lapras', '194'],
                    name: 'Lapras',
                    collectorNumber: '194',
                    numericCollectorNumber: '194',
                    features: [],
                    selectedChipCategories: [
                        { label: 'Lapras', category: 'name' },
                        { label: '194', category: 'collector' },
                    ],
                },
                previewSignature: 'vinted|lapras194',
                previewSource: 'vinted_overlay',
                previewRows: [
                    { card_id: 'lapras-194', name: 'Lapras', set_name: 'Stellar Crown', card_number: '194', search_rank: 99 },
                ],
            },
            { tab: { id: 10, title: 'Pokemon carta Lapras it 194', url: vintedUrl } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(storage.sidePanelState.pageInfo.structuredCard.name, 'Lapras');
    assert.equal(storage.sidePanelState.pageInfo.structuredCard.collectorNumber, '194');
    assert.equal(storage.sidePanelState.pageInfo.structuredCard.numericCollectorNumber, '194');
    assert.deepEqual(storage.sidePanelState.pageInfo.selectedClues, ['Lapras', '194']);
    assert.equal(storage.sidePanelState.best.card_id, 'lapras-194');
});

test('background clue helpers remove generic card words from request titles', () => {
    const source = readRepoFile('config/background.js');
    const removeNoise = extractFunctionSource(source, 'removeMarketplaceSearchNoise');
    const compact = extractFunctionSource(source, 'compactSearchValue');
    const normalize = extractFunctionSource(source, 'normalizeRequestClues');
    const build = extractFunctionSource(source, 'buildTitleWithRequestClues');
    const buildPrimary = extractFunctionSource(source, 'buildPrimaryClueSearchTitle');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`${removeNoise}\n${compact}\n${normalize}\n${build}\n${buildPrimary}\nthis.normalizeRequestClues = normalizeRequestClues; this.buildTitleWithRequestClues = buildTitleWithRequestClues; this.buildPrimaryClueSearchTitle = buildPrimaryClueSearchTitle;`, sandbox);

    assert.deepEqual(sandbox.normalizeRequestClues(['card', 'carte', 'SWSH154', 'Evolving Skies', '35/108']), ['SWSH154', 'Evolving Skies', '35/108']);
    const title = sandbox.buildTitleWithRequestClues('Carta Pokemon Dragonite V', ['card', 'SWSH154']);
    assert.match(title, /Dragonite V/);
    assert.match(title, /SWSH154/);
    assert.doesNotMatch(title, /\b(?:carta|card|carte|cards)\b/i);
    assert.equal(
        sandbox.buildPrimaryClueSearchTitle('Carta Pokémon reshiram B/N ita', ['reshiram', 'Nita'], ['reshiram']),
        'reshiram'
    );
    assert.equal(
        sandbox.buildPrimaryClueSearchTitle('Pikachu, Evoluzioni 35/108', ['Pikachu', 'Evolutions', '35/108'], ['Pikachu']),
        'Pikachu Evolutions 35/108'
    );
});

test('background normalizes Vastro typo to VSTAR in request parsing', () => {
    const source = readRepoFile('config/background.js');
    const cleanCardmarketText = extractFunctionSource(source, 'cleanCardmarketText');
    const normalizeExpansionAlias = extractFunctionSource(source, 'normalizeExpansionAlias');
    const removeNoise = extractFunctionSource(source, 'removeMarketplaceSearchNoise');
    const compact = extractFunctionSource(source, 'compactSearchValue');
    const normalize = extractFunctionSource(source, 'normalizeRequestClues');
    const build = extractFunctionSource(source, 'buildTitleWithRequestClues');
    const buildPrimary = extractFunctionSource(source, 'buildPrimaryClueSearchTitle');
    const scrapeStructured = extractFunctionSource(source, 'scrapeStructuredCardFields');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`${cleanCardmarketText}\n${normalizeExpansionAlias}\n${removeNoise}\n${compact}\n${normalize}\n${build}\n${buildPrimary}\n${scrapeStructured}\nthis.normalizeRequestClues = normalizeRequestClues; this.buildPrimaryClueSearchTitle = buildPrimaryClueSearchTitle; this.scrapeStructuredCardFields = scrapeStructuredCardFields;`, sandbox);

    assert.deepEqual(sandbox.normalizeRequestClues(['Vastro']), ['vstar']);
    assert.equal(sandbox.buildPrimaryClueSearchTitle('Reggigas Vastro', ['Vastro'], []), 'Reggigas vstar');
    assert.equal(sandbox.buildPrimaryClueSearchTitle('Reggigas Vastro', ['Vastro'], ['Regigigas']), 'Regigigas vstar');
    const structured = sandbox.scrapeStructuredCardFields('Regigigas Vastro');
    assert.equal(structured.variation, 'vstar');
    assert.equal(structured.searchName, 'Regigigas vstar');
});

test('CardTrader direct URL opens side panel without page scrape or API search', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storageWrites = [];
    const openedPanels = [];
    let executeScriptCalls = 0;
    let fetchCalls = 0;
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            fetchCalls += 1;
            throw new Error('CardTrader direct path should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({
                    id: 7,
                    title: 'Charizard ex',
                    url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
                }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    executeScriptCalls += 1;
                    throw new Error('CardTrader direct path should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({}),
                    set: async (payload) => {
                        storageWrites.push(payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async (payload) => {
                    openedPanels.push(payload);
                },
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: {
                setIcon: async () => {},
                onClicked: { addListener() {} },
            },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });
    assert.equal(typeof messageListener, 'function');

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'openSidePanelForCurrentTab',
                url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
                title: 'Charizard ex',
                cardtraderBlueprintId: '12345',
            },
            { tab: { id: 7, title: 'Charizard ex', url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex' } },
            resolve
        );
    });

    const finalState = storageWrites.at(-1).sidePanelState;
    assert.equal(response.success, true);
    assert.deepEqual(openedPanels.map((panel) => ({ tabId: panel.tabId })), [{ tabId: 7 }]);
    assert.equal(executeScriptCalls, 0);
    assert.equal(fetchCalls, 0);
    assert.equal(finalState.blueprintId, '12345');
    assert.equal(finalState.pokoinUrl, 'https://pokoin.com/marketplace/en/cards/12345');
    assert.equal(finalState.debug.searched, false);
    assert.equal(finalState.debug.directCardTrader, true);
});

test('CardTrader repeated same blueprint activation reuses cached direct state without loading rewrite', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    const storageWrites = [];
    let executeScriptCalls = 0;
    let fetchCalls = 0;
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async () => {
            fetchCalls += 1;
            throw new Error('CardTrader direct revisit should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                get: async () => ({
                    id: 7,
                    title: 'Charizard ex',
                    url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
                }),
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    executeScriptCalls += 1;
                    throw new Error('CardTrader direct revisit should not scrape');
                },
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel; this.scheduleSidePanelRefresh = scheduleSidePanelRefresh;`, sandbox, { filename: 'config/background.js' });

    const tab = {
        id: 7,
        title: 'Charizard ex',
        url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
    };
    const first = await sandbox.resolveActiveTabForSidePanel(tab, { expectedUrl: tab.url });
    const writesAfterFirst = storageWrites.length;

    await sandbox.scheduleSidePanelRefresh(tab, 'activated');

    assert.equal(first.blueprintId, '12345');
    assert.equal(storageWrites.length, writesAfterFirst, 'same CardTrader direct state should not be rewritten on activation');
    assert.equal(storageWrites.some((state) => state.loading), false, 'revisit should not emit a loading state');
    assert.equal(executeScriptCalls, 0);
    assert.equal(fetchCalls, 0);
});

test('CardTrader direct open reuses cached state without reloading same Pokoin URL', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const storage = {};
    const storageWrites = [];
    const openedPanels = [];
    const cardTraderUrl = 'https://www.cardtrader.com/en/cards/12345-charizard-ex';
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async () => {
            throw new Error('CardTrader direct cached open should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                get: async () => ({ id: 7, title: 'Charizard ex', url: cardTraderUrl }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('CardTrader direct cached open should not scrape');
                },
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async (payload) => openedPanels.push(payload),
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const request = { action: 'openSidePanelForCurrentTab', url: cardTraderUrl, title: 'Charizard ex', cardtraderBlueprintId: '12345' };
    const sender = { tab: { id: 7, title: 'Charizard ex', url: cardTraderUrl } };
    const first = await new Promise((resolve) => messageListener(request, sender, resolve));
    const writesAfterFirst = storageWrites.length;
    const firstState = storage.sidePanelState;
    const second = await new Promise((resolve) => messageListener(request, sender, resolve));

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(storageWrites.length, writesAfterFirst, 'cached direct open should not write an equivalent state again');
    assert.equal(openedPanels.length, 2);
    assert.equal(storage.sidePanelState, firstState, 'unchanged state lets the side panel keep the existing iframe src');
    assert.equal(storage.sidePanelState.pokoinUrl, 'https://pokoin.com/marketplace/en/cards/12345');
});

test('CardTrader different direct blueprint updates cached side-panel state', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    const storageWrites = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async () => {
            throw new Error('CardTrader direct blueprint update should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('CardTrader direct blueprint update should not scrape');
                },
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel; this.scheduleSidePanelRefresh = scheduleSidePanelRefresh;`, sandbox, { filename: 'config/background.js' });

    await sandbox.resolveActiveTabForSidePanel({
        id: 7,
        title: 'Charizard ex',
        url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
    });
    await sandbox.scheduleSidePanelRefresh({
        id: 7,
        title: 'Blastoise ex',
        url: 'https://www.cardtrader.com/en/cards/67890-blastoise-ex',
    }, 'tab-url');

    assert.equal(storage.sidePanelState.blueprintId, '67890');
    assert.equal(storage.sidePanelState.pokoinUrl, 'https://pokoin.com/marketplace/en/cards/67890');
    assert.deepEqual(storageWrites.map((state) => state.blueprintId), ['12345', '67890']);
});

test('CardTrader direct state cache evicts entries beyond last 20', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    const storageWrites = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        AbortController,
        fetch: async () => {
            throw new Error('CardTrader direct cache should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
                getManifest: () => ({ version: '2.0.0' }),
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('CardTrader direct cache should not scrape');
                },
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel; this.scheduleSidePanelRefresh = scheduleSidePanelRefresh;`, sandbox, { filename: 'config/background.js' });

    const makeTab = (id) => ({
        id: 7,
        title: `Card ${id}`,
        url: `https://www.cardtrader.com/en/cards/${id}-card-${id}`,
    });

    for (let id = 1; id <= 21; id += 1) {
        await sandbox.resolveActiveTabForSidePanel(makeTab(id));
    }
    const writesAfterWarmup = storageWrites.length;

    await sandbox.scheduleSidePanelRefresh(makeTab(2), 'activated');
    assert.equal(storageWrites.length, writesAfterWarmup + 1, 'cached CardTrader direct entry should write cached final state');
    assert.equal(storageWrites.at(-1).blueprintId, '2');
    assert.equal(storageWrites.at(-1).debug.cardTraderDirectCacheHit, true);
    assert.equal(storageWrites.at(-1).loading, false);

    await sandbox.scheduleSidePanelRefresh(makeTab(1), 'activated');
    assert.equal(storageWrites.length, writesAfterWarmup + 2, 'oldest CardTrader direct entry should be rebuilt after cache eviction');
    assert.equal(storageWrites.at(-1).blueprintId, '1');
    assert.equal(storageWrites.at(-1).debug.cardTraderDirectCacheHit, undefined);
});

test('CardTrader direct background search returns clean URL slug name', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    let fetchCalls = 0;
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            fetchCalls += 1;
            throw new Error('CardTrader direct search should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('CardTrader direct search should not scrape');
                },
            },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'searchCardForTitle',
                url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
                title: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
            },
            { tab: { id: 7, title: '', url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex' } },
            resolve
        );
    });

    assert.equal(response.success, true);
    assert.equal(response.results[0].blueprint_id, '12345');
    assert.equal(response.results[0].name_en, 'Charizard EX');
    assert.equal(response.results[0].source, 'cardtrader_url');
    assert.equal(fetchCalls, 0);
});

test('CardTrader direct title cleanup drops expansion and site suffix', async () => {
    const source = readRepoFile('config/background.js');
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            throw new Error('CardTrader direct cleanup should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('CardTrader direct cleanup should not scrape');
                },
            },
            storage: {
                session: { get: async () => ({}), set: async () => {} },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.cleanCardTraderDirectName = cleanCardTraderDirectName;`, sandbox, { filename: 'config/background.js' });

    assert.equal(
        sandbox.cleanCardTraderDirectName(
            'Hypno (Cosmos Holo 008/062 | WOTC Employees-Only ©1999 Wizards)',
            'https://www.cardtrader.com/en/cards/99999-hypno-cosmos-holo-wotc-employees-only',
            '99999'
        ),
        'Hypno'
    );
    assert.equal(
        sandbox.cleanCardTraderDirectName(
            'Hypno Wizards of the Coast Era Promos | Pokémon',
            'https://www.cardtrader.com/en/cards/99999-hypno-wizards-of-the-coast-era-promos',
            '99999'
        ),
        'Hypno'
    );
    assert.equal(
        sandbox.cleanCardTraderDirectName(
            'Gengar & Mimikyu GX Team Up | Pokémon',
            'https://www.cardtrader.com/en/cards/88888-gengar-and-mimikyu-gx-team-up',
            '88888'
        ),
        'Gengar & Mimikyu GX'
    );
});

test('CardTrader direct side panel state uses clean card name from URL slug', async () => {
    const source = readRepoFile('config/background.js');
    const storageWrites = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            throw new Error('CardTrader direct path should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('CardTrader direct path should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({}),
                    set: async (payload) => {
                        storageWrites.push(payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const result = await sandbox.resolveActiveTabForSidePanel({
        id: 7,
        title: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
        url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
    });

    const finalState = storageWrites.at(-1).sidePanelState;
    assert.equal(result.best.name, 'Charizard EX');
    assert.equal(finalState.pageInfo.title, 'Charizard EX');
    assert.equal(finalState.pageInfo.structuredCard.name, 'Charizard EX');
    assert.equal(finalState.best.name, 'Charizard EX');
    assert.equal(finalState.debug.searched, true);
    assert.equal(finalState.debug.cardtraderBlueprintId, '12345');
});

test('CardTrader direct side panel state uses clean card name from parenthesized title', async () => {
    const source = readRepoFile('config/background.js');
    const storageWrites = [];
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            throw new Error('CardTrader direct path should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('CardTrader direct path should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({}),
                    set: async (payload) => {
                        storageWrites.push(payload);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    await sandbox.resolveActiveTabForSidePanel({
        id: 7,
        title: 'Hypno (Cosmos Holo 008/062 | WOTC Employees-Only ©1999 Wizards)',
        url: 'https://www.cardtrader.com/en/cards/99999-hypno-cosmos-holo-wotc-employees-only',
    });

    const finalState = storageWrites.at(-1).sidePanelState;
    assert.equal(finalState.pageInfo.title, 'Hypno');
    assert.equal(finalState.pageInfo.structuredCard.name, 'Hypno');
    assert.equal(finalState.best.name, 'Hypno');
});

test('CardTrader direct state cannot be overwritten by delayed non-direct refresh', async () => {
    const source = readRepoFile('config/background.js');
    const storageWrites = [];
    let activeState = null;
    let releaseFetch;
    const fetchGate = new Promise((resolve) => {
        releaseFetch = resolve;
    });
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url) => {
            await fetchGate;
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            return {
                ok: true,
                json: async () => ({
                    rows: [{ card_id: '2222', name: 'Boss\'s Orders', canonical_name: 'Boss\'s Orders', search_rank: 99 }],
                    matches: [{ cardId: '2222', name: 'Boss\'s Orders', score: 99 }],
                }),
            };
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: {
                        title: 'Boss\'s Orders',
                        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Rebel-Clash/Bosss-Orders',
                        hostname: 'www.cardmarket.com',
                        structuredCard: { name: 'Boss\'s Orders', searchName: 'Boss\'s Orders' },
                    },
                }],
            },
            storage: {
                session: {
                    get: async () => ({ sidePanelState: activeState }),
                    set: async (payload) => {
                        if (payload.sidePanelState) {
                            activeState = payload.sidePanelState;
                            storageWrites.push(payload);
                        }
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const delayedRefresh = sandbox.resolveActiveTabForSidePanel({
        id: 7,
        title: 'Boss\'s Orders',
        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Rebel-Clash/Bosss-Orders',
    });

    activeState = {
        updatedAt: Date.now(),
        pageInfo: {
            title: 'Air Balloon',
            url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
            hostname: 'www.cardtrader.com',
            cardtraderBlueprintId: '9876',
        },
        rows: [{ card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' }],
        best: { card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' },
        blueprintId: '9876',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/9876',
        error: '',
        debug: { cardtraderBlueprintId: '9876', directCardTrader: true },
    };
    releaseFetch();

    const result = await delayedRefresh;
    assert.equal(result.stale, true);
    assert.equal(activeState.blueprintId, '9876');
    assert.equal(activeState.best.name, 'Air Balloon');
    assert.equal(storageWrites.some((write) => write.sidePanelState?.blueprintId === '2222'), false);
});

test('scheduled stale refresh from previous page is ignored after CardTrader direct state', async () => {
    const source = readRepoFile('config/background.js');
    const storageWrites = [];
    const timers = [];
    let activeState = {
        updatedAt: Date.now(),
        pageInfo: {
            title: 'Air Balloon',
            url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
            hostname: 'www.cardtrader.com',
            cardtraderBlueprintId: '9876',
        },
        rows: [{ card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' }],
        best: { card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' },
        blueprintId: '9876',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/9876',
        error: '',
        debug: { cardtraderBlueprintId: '9876', directCardTrader: true },
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout: (callback) => {
            timers.push(callback);
            return callback;
        },
        clearTimeout: () => {},
        fetch: async () => {
            throw new Error('stale refresh should not search');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({
                    id: 7,
                    title: 'Air Balloon',
                    url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
                }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('stale refresh should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({ sidePanelState: activeState }),
                    set: async (payload) => {
                        if (payload.sidePanelState) {
                            activeState = payload.sidePanelState;
                            storageWrites.push(payload);
                        }
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.scheduleSidePanelRefresh = scheduleSidePanelRefresh;`, sandbox, { filename: 'config/background.js' });

    await sandbox.scheduleSidePanelRefresh({
        id: 7,
        title: 'Boss\'s Orders',
        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Rebel-Clash/Bosss-Orders',
    });
    assert.equal(timers.length, 1);
    await timers[0]();

    assert.equal(activeState.blueprintId, '9876');
    assert.equal(storageWrites.length, 0);
});

test('scheduled same CardTrader direct URL refresh preserves blueprint lock', async () => {
    const source = readRepoFile('config/background.js');
    const timers = [];
    const storageWrites = [];
    let activeState = {
        updatedAt: Date.now(),
        pageInfo: {
            title: 'Air Balloon',
            url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
            hostname: 'www.cardtrader.com',
            cardtraderBlueprintId: '9876',
        },
        rows: [{ card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' }],
        best: { card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' },
        blueprintId: '9876',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/9876',
        error: '',
        debug: { cardtraderBlueprintId: '9876', directCardTrader: true },
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout: (callback) => {
            timers.push(callback);
            return callback;
        },
        clearTimeout: () => {},
        fetch: async () => {
            throw new Error('locked direct refresh should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('locked direct refresh should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({ sidePanelState: activeState }),
                    set: async (payload) => {
                        if (payload.sidePanelState) {
                            activeState = payload.sidePanelState;
                            storageWrites.push(payload);
                        }
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.scheduleSidePanelRefresh = scheduleSidePanelRefresh;`, sandbox, { filename: 'config/background.js' });

    await sandbox.scheduleSidePanelRefresh({
        id: 7,
        title: 'Air Balloon',
        url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
    }, 'activated');

    assert.equal(timers.length, 0);
    assert.equal(storageWrites.length, 0);
    assert.equal(activeState.blueprintId, '9876');
});

test('CardTrader direct URL change updates blueprint state', async () => {
    const source = readRepoFile('config/background.js');
    const storageWrites = [];
    let activeState = {
        updatedAt: Date.now(),
        pageInfo: {
            title: 'Air Balloon',
            url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
            hostname: 'www.cardtrader.com',
            cardtraderBlueprintId: '9876',
        },
        rows: [{ card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' }],
        best: { card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' },
        blueprintId: '9876',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/9876',
        error: '',
        debug: { cardtraderBlueprintId: '9876', directCardTrader: true },
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            throw new Error('CardTrader direct URL change should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('CardTrader direct URL change should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({ sidePanelState: activeState }),
                    set: async (payload) => {
                        if (payload.sidePanelState) {
                            activeState = payload.sidePanelState;
                            storageWrites.push(payload);
                        }
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const result = await sandbox.resolveActiveTabForSidePanel({
        id: 7,
        title: 'Charizard ex',
        url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
    });

    assert.equal(result.blueprintId, '12345');
    assert.equal(activeState.blueprintId, '12345');
    assert.equal(storageWrites.at(-1).sidePanelState.pageInfo.cardtraderBlueprintId, '12345');
    assert.equal(storageWrites.at(-1).sidePanelState.best.name, 'Charizard ex');
});

test('CardTrader direct state cannot be overwritten by delayed non-direct refresh', async () => {
    const source = readRepoFile('config/background.js');
    const storageWrites = [];
    let activeState = null;
    let releaseFetch;
    const fetchGate = new Promise((resolve) => {
        releaseFetch = resolve;
    });
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url) => {
            await fetchGate;
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            return {
                ok: true,
                json: async () => ({
                    rows: [{ card_id: '2222', name: 'Boss\'s Orders', canonical_name: 'Boss\'s Orders', search_rank: 99 }],
                    matches: [{ cardId: '2222', name: 'Boss\'s Orders', score: 99 }],
                }),
            };
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: {
                        title: 'Boss\'s Orders',
                        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Rebel-Clash/Bosss-Orders',
                        hostname: 'www.cardmarket.com',
                        structuredCard: { name: 'Boss\'s Orders', searchName: 'Boss\'s Orders' },
                    },
                }],
            },
            storage: {
                session: {
                    get: async () => ({ sidePanelState: activeState }),
                    set: async (payload) => {
                        if (payload.sidePanelState) {
                            activeState = payload.sidePanelState;
                            storageWrites.push(payload);
                        }
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const delayedRefresh = sandbox.resolveActiveTabForSidePanel({
        id: 7,
        title: 'Boss\'s Orders',
        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Rebel-Clash/Bosss-Orders',
    });

    activeState = {
        updatedAt: Date.now(),
        pageInfo: {
            title: 'Air Balloon',
            url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
            hostname: 'www.cardtrader.com',
            cardtraderBlueprintId: '9876',
        },
        rows: [{ card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' }],
        best: { card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' },
        blueprintId: '9876',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/9876',
        error: '',
        debug: { cardtraderBlueprintId: '9876', directCardTrader: true },
    };
    releaseFetch();

    const result = await delayedRefresh;
    assert.equal(result.stale, true);
    assert.equal(activeState.blueprintId, '9876');
    assert.equal(activeState.best.name, 'Air Balloon');
    assert.equal(storageWrites.some((write) => write.sidePanelState?.blueprintId === '2222'), false);
});

test('scheduled stale refresh from previous page is ignored after CardTrader direct state', async () => {
    const source = readRepoFile('config/background.js');
    const storageWrites = [];
    const timers = [];
    let activeState = {
        updatedAt: Date.now(),
        pageInfo: {
            title: 'Air Balloon',
            url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
            hostname: 'www.cardtrader.com',
            cardtraderBlueprintId: '9876',
        },
        rows: [{ card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' }],
        best: { card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' },
        blueprintId: '9876',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/9876',
        error: '',
        debug: { cardtraderBlueprintId: '9876', directCardTrader: true },
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout: (callback) => {
            timers.push(callback);
            return callback;
        },
        clearTimeout: () => {},
        fetch: async () => {
            throw new Error('stale refresh should not search');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({
                    id: 7,
                    title: 'Air Balloon',
                    url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
                }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('stale refresh should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({ sidePanelState: activeState }),
                    set: async (payload) => {
                        if (payload.sidePanelState) {
                            activeState = payload.sidePanelState;
                            storageWrites.push(payload);
                        }
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.scheduleSidePanelRefresh = scheduleSidePanelRefresh;`, sandbox, { filename: 'config/background.js' });

    await sandbox.scheduleSidePanelRefresh({
        id: 7,
        title: 'Boss\'s Orders',
        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Rebel-Clash/Bosss-Orders',
    });
    assert.equal(timers.length, 1);
    await timers[0]();

    assert.equal(activeState.blueprintId, '9876');
    assert.equal(storageWrites.length, 0);
});

test('scheduled same CardTrader direct URL refresh preserves blueprint lock', async () => {
    const source = readRepoFile('config/background.js');
    const timers = [];
    const storageWrites = [];
    let activeState = {
        updatedAt: Date.now(),
        pageInfo: {
            title: 'Air Balloon',
            url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
            hostname: 'www.cardtrader.com',
            cardtraderBlueprintId: '9876',
        },
        rows: [{ card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' }],
        best: { card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' },
        blueprintId: '9876',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/9876',
        error: '',
        debug: { cardtraderBlueprintId: '9876', directCardTrader: true },
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout: (callback) => {
            timers.push(callback);
            return callback;
        },
        clearTimeout: () => {},
        fetch: async () => {
            throw new Error('locked direct refresh should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('locked direct refresh should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({ sidePanelState: activeState }),
                    set: async (payload) => {
                        if (payload.sidePanelState) {
                            activeState = payload.sidePanelState;
                            storageWrites.push(payload);
                        }
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.scheduleSidePanelRefresh = scheduleSidePanelRefresh;`, sandbox, { filename: 'config/background.js' });

    await sandbox.scheduleSidePanelRefresh({
        id: 7,
        title: 'Air Balloon',
        url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
    }, 'activated');

    assert.equal(timers.length, 0);
    assert.equal(storageWrites.length, 0);
    assert.equal(activeState.blueprintId, '9876');
});

test('CardTrader direct URL change updates blueprint state', async () => {
    const source = readRepoFile('config/background.js');
    const storageWrites = [];
    let activeState = {
        updatedAt: Date.now(),
        pageInfo: {
            title: 'Air Balloon',
            url: 'https://www.cardtrader.com/en/cards/9876-air-balloon',
            hostname: 'www.cardtrader.com',
            cardtraderBlueprintId: '9876',
        },
        rows: [{ card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' }],
        best: { card_id: '9876', name: 'Air Balloon', source: 'cardtrader_url' },
        blueprintId: '9876',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/9876',
        error: '',
        debug: { cardtraderBlueprintId: '9876', directCardTrader: true },
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async () => {
            throw new Error('CardTrader direct URL change should not fetch');
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => {
                    throw new Error('CardTrader direct URL change should not scrape');
                },
            },
            storage: {
                session: {
                    get: async () => ({ sidePanelState: activeState }),
                    set: async (payload) => {
                        if (payload.sidePanelState) {
                            activeState = payload.sidePanelState;
                            storageWrites.push(payload);
                        }
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const result = await sandbox.resolveActiveTabForSidePanel({
        id: 7,
        title: 'Charizard ex',
        url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
    });

    assert.equal(result.blueprintId, '12345');
    assert.equal(activeState.blueprintId, '12345');
    assert.equal(storageWrites.at(-1).sidePanelState.pageInfo.cardtraderBlueprintId, '12345');
    assert.equal(storageWrites.at(-1).sidePanelState.best.name, 'Charizard ex');
});

test('side panel renders direct CardTrader card as full panel with clean header', () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const bodyClassList = createClassListStub();
    const makeElement = (id) => {
        const classList = createClassListStub();
        const element = {
            id,
            textContent: '',
            hidden: false,
            src: '',
            classList,
            replaceChildren() {
                this.children = [];
            },
            appendChild(child) {
                this.children = [...(this.children || []), child];
                return child;
            },
            addEventListener() {},
        };
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo']) {
        makeElement(id);
    }

    const sandbox = {
        document: {
            body: { classList: bodyClassList },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => {
                const element = createDomElement(tagName);
                element.classList = createClassListStub();
                return element;
            },
        },
        chrome: {
            storage: {
                session: { get: async () => ({}) },
                onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({ success: true }) },
        },
        fetch: async () => ({ ok: false, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.renderState = renderState;`, sandbox, { filename: 'ui-pages/sidepanel.js' });

    sandbox.renderState({
        pageInfo: {
            title: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
            url: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
            structuredCard: {},
            cardtraderBlueprintId: '12345',
        },
        best: {
            card_id: '12345',
            name: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
            source: 'cardtrader_url',
        },
        blueprintId: '12345',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/12345',
        rows: [],
    });

    assert.equal(elementsById.get('cardName').textContent, 'Charizard EX');
    assert.equal(elementsById.get('pokoinFrame').src, 'https://pokoin.com/marketplace/en/cards/12345');
    assert.equal(elementsById.get('frameSection').hidden, false);
    assert.equal(elementsById.get('frameSection').classList.contains('frame-section-direct'), true);
    assert.equal(bodyClassList.contains('direct-card-view'), true);
    assert.equal(elementsById.get('candidatesSection').hidden, true);
});

test('side panel keeps Pokoin iframe alive for same cached URL updates', () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const bodyClassList = createClassListStub();
    const srcWrites = [];
    const makeElement = (id) => {
        const element = createDomElement(id === 'pokoinFrame' ? 'iframe' : 'div');
        element.id = id;
        element.hidden = false;
        element.classList = createClassListStub();
        element.replaceChildren = function replaceChildren(...children) {
            this.children = [];
            children.forEach((child) => this.appendChild(child));
        };
        element.addEventListener = () => {};
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo', 'debugInfo']) {
        makeElement(id);
    }
    const frame = elementsById.get('pokoinFrame');
    let frameSrc = '';
    Object.defineProperty(frame, 'src', {
        get: () => frameSrc,
        set: (value) => {
            srcWrites.push(value);
            frameSrc = value;
        },
    });

    const sandbox = {
        document: {
            body: { classList: bodyClassList },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => {
                const element = createDomElement(tagName);
                element.classList = createClassListStub();
                return element;
            },
        },
        chrome: {
            storage: {
                session: { get: async () => ({}) },
                onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({ success: true }) },
        },
        fetch: async () => ({ ok: false, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.renderState = renderState;`, sandbox, { filename: 'ui-pages/sidepanel.js' });

    const pokoinUrl = 'https://pokoin.com/marketplace/en/cards/548832/special-illustration-rare-mew-ex-232-091-paldean-fates';
    sandbox.renderState({
        pageInfo: { title: 'Mew ex 232/091', url: 'https://www.vinted.it/items/50-mew-ex' },
        best: { card_id: '548832', name: 'Mew ex', pokoin_price: '10 PKN' },
        blueprintId: '548832',
        pokoinUrl,
        rows: [{ card_id: '548832', name: 'Mew ex', pokoin_price: '10 PKN' }],
        debug: { phaseTimings: { totalMs: 100 } },
    });
    sandbox.renderState({
        pageInfo: { title: 'Mew ex 232/091', url: 'https://www.vinted.it/items/50-mew-ex' },
        best: { card_id: '548832', name: 'Mew ex', pokoin_price: '12 PKN' },
        blueprintId: '548832',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/548832',
        rows: [
            { card_id: '548832', name: 'Mew ex', pokoin_price: '12 PKN' },
            { card_id: '999999', name: 'Mew ex alternate', pokoin_price: '8 PKN' },
        ],
        debug: { phaseTimings: { totalMs: 25 } },
    });
    sandbox.renderState({
        pageInfo: { title: 'Charizard V', url: 'https://www.vinted.it/items/51-charizard-v' },
        best: { card_id: '777777', name: 'Charizard V' },
        blueprintId: '777777',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/777777/charizard-v',
        rows: [{ card_id: '777777', name: 'Charizard V' }],
    });

    assert.deepEqual(srcWrites, [
        pokoinUrl,
        'https://pokoin.com/marketplace/en/cards/777777/charizard-v',
    ]);
    assert.equal(elementsById.get('pokoinFrame'), frame, 'same iframe node should remain mounted');
    assert.equal(elementsById.get('candidateList').children[0].href, 'https://pokoin.com/marketplace/en/cards/777777');
    assert.equal(elementsById.get('frameSection').hidden, false);
});

test('side panel candidate click opens canonical URL without changing iframe', () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const bodyClassList = createClassListStub();
    const srcWrites = [];
    const openedTabs = [];
    const makeElement = (id) => {
        const element = createDomElement(id === 'pokoinFrame' ? 'iframe' : 'div');
        element.id = id;
        element.hidden = false;
        element.classList = createClassListStub();
        element.replaceChildren = function replaceChildren(...children) {
            this.children = [];
            children.forEach((child) => this.appendChild(child));
        };
        element.addEventListener = () => {};
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo', 'debugInfo']) {
        makeElement(id);
    }
    const frame = elementsById.get('pokoinFrame');
    let frameSrc = '';
    Object.defineProperty(frame, 'src', {
        get: () => frameSrc,
        set: (value) => {
            srcWrites.push(value);
            frameSrc = value;
        },
    });

    const sandbox = {
        document: {
            body: { classList: bodyClassList },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => {
                const element = createDomElement(tagName);
                element.classList = createClassListStub();
                return element;
            },
        },
        chrome: {
            tabs: {
                create: async (payload) => {
                    openedTabs.push(payload);
                    return {};
                },
            },
            storage: {
                session: { get: async () => ({}) },
                onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({ success: true }) },
        },
        fetch: async () => ({ ok: false, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.renderState = renderState;`, sandbox, { filename: 'ui-pages/sidepanel.js' });

    sandbox.renderState({
        pageInfo: { title: 'Mew ex 232/091', url: 'https://www.vinted.it/items/50-mew-ex' },
        best: { card_id: '548832', name: 'Mew ex' },
        blueprintId: '548832',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/548832/current-best',
        rows: [
            { card_id: '548832', name: 'Mew ex' },
            {
                card_id: '999999',
                name: 'Mew ex alternate',
                canonicalUrl: 'https://pokoin.com/marketplace/en/cards/999999/mew-ex-alt',
                marketplaceUrl: 'https://pokoin.com/marketplace/en/cards/999999',
            },
        ],
    });

    const alternateCandidate = elementsById.get('candidateList').children[1];
    alternateCandidate.eventListeners.click({
        preventDefault() {},
        stopPropagation() {},
    });

    assert.equal(openedTabs.length, 1);
    assert.equal(openedTabs[0].url, 'https://pokoin.com/marketplace/en/cards/999999/mew-ex-alt');
    assert.deepEqual(srcWrites, ['https://pokoin.com/marketplace/en/cards/548832/current-best']);
    assert.equal(frame.src, 'https://pokoin.com/marketplace/en/cards/548832/current-best');
});

test('side panel candidate keyboard activation uses window fallback', () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const openedWindows = [];
    const makeElement = (id) => {
        const element = createDomElement(id === 'pokoinFrame' ? 'iframe' : 'div');
        element.id = id;
        element.hidden = false;
        element.classList = createClassListStub();
        element.replaceChildren = function replaceChildren(...children) {
            this.children = [];
            children.forEach((child) => this.appendChild(child));
        };
        element.addEventListener = () => {};
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo', 'debugInfo']) {
        makeElement(id);
    }

    const sandbox = {
        document: {
            body: { classList: createClassListStub() },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => {
                const element = createDomElement(tagName);
                element.classList = createClassListStub();
                return element;
            },
        },
        window: {
            open: (url, target, features) => {
                openedWindows.push({ url, target, features });
            },
        },
        chrome: {
            storage: {
                session: { get: async () => ({}) },
                onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({ success: true }) },
        },
        fetch: async () => ({ ok: false, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.renderState = renderState;`, sandbox, { filename: 'ui-pages/sidepanel.js' });

    sandbox.renderState({
        pageInfo: { title: 'Bulbasaur', url: 'https://www.ebay.com/itm/1' },
        best: { card_id: '1', name: 'Bulbasaur' },
        blueprintId: '1',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/1',
        rows: [{ card_id: '2', name: 'Bulbasaur alt', marketplacePath: '/marketplace/en/cards/2/bulbasaur-alt' }],
    });

    const candidate = elementsById.get('candidateList').children[0];
    candidate.eventListeners.keydown({
        key: ' ',
        preventDefault() {},
        stopPropagation() {},
    });

    assert.deepEqual(openedWindows, [{
        url: 'https://pokoin.com/marketplace/en/cards/2/bulbasaur-alt',
        target: '_blank',
        features: 'noopener',
    }]);
});

test('side panel keeps direct CardTrader iframe alive for same blueprint URL', () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const bodyClassList = createClassListStub();
    const srcWrites = [];
    const makeElement = (id) => {
        const element = createDomElement(id === 'pokoinFrame' ? 'iframe' : 'div');
        element.id = id;
        element.hidden = false;
        element.classList = createClassListStub();
        element.replaceChildren = function replaceChildren(...children) {
            this.children = [];
            children.forEach((child) => this.appendChild(child));
        };
        element.addEventListener = () => {};
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo', 'debugInfo']) {
        makeElement(id);
    }
    const frame = elementsById.get('pokoinFrame');
    let frameSrc = '';
    Object.defineProperty(frame, 'src', {
        get: () => frameSrc,
        set: (value) => {
            srcWrites.push(value);
            frameSrc = value;
        },
    });

    const sandbox = {
        document: {
            body: { classList: bodyClassList },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => createDomElement(tagName),
        },
        chrome: {
            storage: {
                session: { get: async () => ({}) },
                onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({ success: true }) },
        },
        fetch: async () => ({ ok: false, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.renderState = renderState;`, sandbox, { filename: 'ui-pages/sidepanel.js' });

    const directState = {
        pageInfo: {
            title: 'https://www.cardtrader.com/en/cards/12345-charizard-v',
            url: 'https://www.cardtrader.com/en/cards/12345-charizard-v',
            structuredCard: {},
            cardtraderBlueprintId: '12345',
        },
        best: {
            card_id: '12345',
            name: 'https://www.cardtrader.com/en/cards/12345-charizard-v',
            source: 'cardtrader_url',
        },
        blueprintId: '12345',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/12345',
        rows: [],
    };
    sandbox.renderState(directState);
    sandbox.renderState({
        ...directState,
        debug: { phaseTimings: { totalMs: 10 } },
        pokoinUrl: 'https://www.cardtrader.com/en/cards/12345-charizard-v',
        rows: [{ card_id: '12345', name: 'Charizard V', pokoin_price: '22 PKN' }],
    });

    assert.deepEqual(srcWrites, ['https://pokoin.com/marketplace/en/cards/12345']);
    assert.equal(elementsById.get('pokoinFrame'), frame, 'direct view should reuse the iframe node');
    assert.equal(elementsById.get('frameSection').classList.contains('frame-section-direct'), true);
    assert.equal(bodyClassList.contains('direct-card-view'), true);
    assert.equal(elementsById.get('candidatesSection').hidden, true);
});

test('side panel does not use direct full-panel classes for other marketplaces', () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const bodyClassList = createClassListStub();
    const makeElement = (id) => {
        const classList = createClassListStub();
        const element = {
            id,
            textContent: '',
            hidden: false,
            src: '',
            classList,
            replaceChildren() {
                this.children = [];
            },
            appendChild(child) {
                this.children = [...(this.children || []), child];
                return child;
            },
            addEventListener() {},
        };
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo']) {
        makeElement(id);
    }

    const sandbox = {
        document: {
            body: { classList: bodyClassList },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => createDomElement(tagName),
        },
        chrome: {
            storage: {
                session: { get: async () => ({}) },
                onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({ success: true }) },
        },
        fetch: async () => ({ ok: false, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.renderState = renderState;`, sandbox, { filename: 'ui-pages/sidepanel.js' });

    sandbox.renderState({
        pageInfo: {
            title: 'Gengar & Mimikyu GX',
            url: 'https://www.vinted.it/items/50-gengar-mimikyu-gx',
            structuredCard: {},
        },
        best: {
            card_id: '88888',
            name: 'Gengar & Mimikyu GX',
            source: 'background_card_search',
        },
        blueprintId: '88888',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/88888',
        rows: [{ card_id: '88888', name: 'Gengar & Mimikyu GX', expansion_symbol_url: 'https://cdn.example/logo.png' }],
    });

    assert.equal(elementsById.get('cardName').textContent, 'Gengar & Mimikyu GX');
    assert.equal(elementsById.get('frameSection').classList.contains('frame-section-direct'), false);
    assert.equal(bodyClassList.contains('direct-card-view'), false);
    assert.equal(elementsById.get('candidatesSection').hidden, false);
});

test('side panel loading state uses short Pokoin copy', () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const bodyClassList = createClassListStub();
    const makeElement = (id) => {
        const classList = createClassListStub();
        const element = {
            id,
            textContent: '',
            hidden: false,
            src: '',
            classList,
            replaceChildren() {
                this.children = [];
            },
            appendChild(child) {
                this.children = [...(this.children || []), child];
                return child;
            },
            addEventListener() {},
        };
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo']) {
        makeElement(id);
    }

    const sandbox = {
        document: {
            body: { classList: bodyClassList },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => createDomElement(tagName),
        },
        chrome: {
            storage: {
                session: { get: async () => ({}) },
                onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({ success: true }) },
        },
        fetch: async () => ({ ok: false, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.renderState = renderState;`, sandbox, { filename: 'ui-pages/sidepanel.js' });

    sandbox.renderState({ loading: true });

    assert.equal(elementsById.get('cardName').textContent, 'Resolving card...');
    assert.equal(elementsById.get('status').textContent, 'Finding Pokoin matches...');
    assert.equal(elementsById.get('status').hidden, false);
});

test('side panel preserves API candidate order while rendering logos', () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const bodyClassList = createClassListStub();
    const makeElement = (id) => {
        const classList = createClassListStub();
        const element = {
            id,
            textContent: '',
            hidden: false,
            src: '',
            classList,
            replaceChildren() {
                this.children = [];
            },
            appendChild(child) {
                this.children = [...(this.children || []), child];
                return child;
            },
            addEventListener() {},
        };
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo']) {
        makeElement(id);
    }

    const sandbox = {
        document: {
            body: { classList: bodyClassList },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => createDomElement(tagName),
        },
        chrome: {
            storage: {
                session: { get: async () => ({}) },
                onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({ success: true }) },
        },
        fetch: async () => ({ ok: false, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.renderState = renderState;`, sandbox, { filename: 'ui-pages/sidepanel.js' });

    sandbox.renderState({
        pageInfo: { title: 'Dragonite V', url: 'https://www.vinted.it/items/50-dragonite' },
        best: { card_id: '1', name: 'Dragonite V', set_name: 'Unknown Set', card_number: '1/100' },
        blueprintId: '1',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/1',
        rows: [
            { card_id: '1', name: 'First API Result', set_name: 'Unknown Set', card_number: '1/100' },
            { card_id: '2', name: 'Second With Logo', set_name: 'Known Set', card_number: '2/100', expansion_symbol_url: 'https://cdn.example/logo.png' },
            { card_id: '3', name: 'Third API Result', set_name: 'Unknown Set', card_number: '3/100' },
        ],
    });

    const rendered = elementsById.get('candidateList').children;
    assert.equal(rendered[0].href, 'https://pokoin.com/marketplace/en/cards/1');
    assert.equal(rendered[1].href, 'https://pokoin.com/marketplace/en/cards/2');
    assert.equal(rendered[2].href, 'https://pokoin.com/marketplace/en/cards/3');
    assert.equal(rendered[1].querySelector('img').src, 'https://cdn.example/logo.png');
});

test('side panel uses cached expansion logos without repeated fetches', async () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const elementsById = new Map();
    const bodyClassList = createClassListStub();
    let fetchCalls = 0;
    const makeElement = (id) => {
        const element = createDomElement(id === 'pokoinFrame' ? 'iframe' : 'div');
        element.id = id;
        element.hidden = false;
        element.classList = createClassListStub();
        element.replaceChildren = function replaceChildren(...children) {
            this.children = [];
            children.forEach((child) => this.appendChild(child));
        };
        element.addEventListener = () => {};
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo']) {
        makeElement(id);
    }

    const sandbox = {
        document: {
            body: { classList: bodyClassList },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => {
                const element = createDomElement(tagName);
                element.classList = createClassListStub();
                return element;
            },
        },
        chrome: {
            storage: {
                session: { get: async () => ({}) },
                onChanged: { addListener() {} },
            },
            runtime: { sendMessage: async () => ({ success: true }) },
        },
        fetch: async () => {
            fetchCalls += 1;
            return {
                ok: true,
                json: async () => ({
                    expansions: [{ name: 'Paldean Fates', symbolImageUrl: 'https://cdn.example/paldean-fates.png' }],
                }),
            };
        },
        Map,
        URL,
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.renderState = renderState; this.loadExpansionLogos = loadExpansionLogos;`, sandbox, { filename: 'ui-pages/sidepanel.js' });

    await sandbox.loadExpansionLogos();
    await sandbox.loadExpansionLogos();
    const state = {
        pageInfo: { title: 'Mew ex 232/091', url: 'https://www.vinted.it/items/50-mew-ex' },
        best: { card_id: '548832', name: 'Mew ex', set_name: 'Paldean Fates' },
        blueprintId: '548832',
        pokoinUrl: 'https://pokoin.com/marketplace/en/cards/548832',
        rows: [
            { card_id: '548832', name: 'Mew ex', set_name: 'Paldean Fates' },
            { card_id: '999999', name: 'Mew ex alt', set_name: 'Paldean Fates' },
        ],
    };
    sandbox.renderState(state);
    sandbox.renderState(state);

    const firstLogo = elementsById.get('candidateList').children[0].querySelector('img');
    const secondLogo = elementsById.get('candidateList').children[1].querySelector('img');
    assert.equal(fetchCalls, 1);
    assert.equal(firstLogo.className, 'candidate-logo');
    assert.equal(firstLogo.src, 'https://cdn.example/paldean-fates.png');
    assert.equal(secondLogo.src, 'https://cdn.example/paldean-fates.png');
});

test('side panel warms Pokoin auth session on load', async () => {
    const source = readRepoFile('ui-pages/sidepanel.js');
    const sentMessages = [];
    const elementsById = new Map();
    const makeElement = (id) => {
        const element = {
            id,
            hidden: false,
            textContent: '',
            classList: createClassListStub(),
            addEventListener() {},
            replaceChildren() {},
            appendChild() {},
            className: '',
            src: '',
        };
        elementsById.set(id, element);
        return element;
    };
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList', 'runtimeInfo', 'debugInfo']) {
        makeElement(id);
    }

    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        document: {
            body: { classList: createClassListStub() },
            getElementById: (id) => elementsById.get(id),
            createElement: (tagName) => createDomElement(tagName),
        },
        chrome: {
            storage: {
                session: { get: async () => ({}) },
                onChanged: { addListener() {} },
            },
            runtime: {
                sendMessage: async (message) => {
                    sentMessages.push(message);
                    return { success: true };
                },
            },
        },
        fetch: async () => ({ ok: true, json: async () => ({ expansions: [] }) }),
        Map,
        URL,
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'ui-pages/sidepanel.js' });
    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(sentMessages.some((message) => message.action === 'requestPokoinAuthToken'));
});

test('CardTrader injected button intercepts click and opens side panel workflow', async () => {
    const source = readRepoFile('content.js');
    const contentStart = source.indexOf('function pokoinIconUrl');
    const functions = [
        'function setPokoinButtonLabel(button) { button.innerHTML = "Pokoin.com"; }',
        'function applyPokoinButtonStyles() {}',
        extractFunctionSource(source, 'extractCardTraderBlueprintId', contentStart),
        extractFunctionSource(source, 'cardTraderDirectTitle', contentStart),
        extractFunctionSource(source, 'patchCardTraderCardPage', contentStart),
        extractFunctionSource(source, 'openPokoinSidePanel', contentStart),
    ].join('\n');
    const messages = [];
    const listeners = {};
    const titleElement = {
        textContent: 'Charizard ex',
        querySelector: () => null,
        insertAdjacentElement(_position, element) {
            this.insertedElement = element;
        },
    };
    const titleBlock = {
        querySelector: (selector) => selector === 'h2' ? titleElement : null,
    };
    const documentStub = {
        title: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
        querySelector(selector) {
            if (selector === '[data-pokoin-cardtrader-button]') {
                return null;
            }
            if (selector === '.py-3.text-center.text-sm-left') {
                return titleBlock;
            }
            if (selector === '.py-3.text-center.text-sm-left h2, h1, h2') {
                return titleElement;
            }
            return null;
        },
        createElement(tagName) {
            return {
                tagName: tagName.toUpperCase(),
                style: {},
                attributes: {},
                setAttribute(name, value) {
                    this.attributes[name] = value;
                },
                querySelector: () => ({ style: {} }),
                addEventListener(type, listener, options) {
                    listeners[type] = { listener, options };
                },
            };
        },
    };
    const sandbox = {
        window: {
            location: {
                hostname: 'www.cardtrader.com',
                pathname: '/en/cards/12345-charizard-ex',
                href: 'https://www.cardtrader.com/en/cards/12345-charizard-ex',
            },
        },
        document: documentStub,
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true };
                },
            },
        },
        console: { log() {}, warn() {}, error() {} },
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(`${functions}\nthis.patchCardTraderCardPage = patchCardTraderCardPage;`, sandbox, { filename: 'content.js' });

    sandbox.patchCardTraderCardPage();
    const event = {
        prevented: false,
        stopped: false,
        immediateStopped: false,
        preventDefault() {
            this.prevented = true;
        },
        stopPropagation() {
            this.stopped = true;
        },
        stopImmediatePropagation() {
            this.immediateStopped = true;
        },
    };
    await listeners.click.listener(event);
    await listeners.click.listener(event);

    assert.equal(titleElement.insertedElement.attributes['data-pokoin-cardtrader-button'], 'true');
    assert.equal(listeners.click.options, true);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    assert.equal(event.immediateStopped, true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].action, 'openSidePanelForCurrentTab');
    assert.equal(messages[0].cardtraderBlueprintId, '12345');
    assert.equal(messages[0].title, 'Charizard ex');
});

test('CardTrader button click sends one side-panel message and blocks page handlers', async () => {
    const source = readRepoFile('content.js');
    const contentStart = source.indexOf('function pokoinIconUrl');
    const functions = [
        'function setPokoinButtonLabel(button) { button.innerHTML = "Pokoin.com"; }',
        'function applyPokoinButtonStyles() {}',
        extractFunctionSource(source, 'extractCardTraderBlueprintId', contentStart),
        extractFunctionSource(source, 'cardTraderDirectTitle', contentStart),
        extractFunctionSource(source, 'patchCardTraderCardPage', contentStart),
        extractFunctionSource(source, 'openPokoinSidePanel', contentStart),
    ].join('\n');
    const messages = [];
    const listeners = {};
    let resolveSendMessage;
    const sendMessagePromise = new Promise((resolve) => {
        resolveSendMessage = resolve;
    });
    const titleElement = {
        textContent: 'Hypno Wizards of the Coast Era Promos',
        insertAdjacentElement(_position, element) {
            this.insertedElement = element;
        },
    };
    const titleBlock = {
        querySelector: (selector) => selector === 'h2' ? titleElement : null,
    };
    const sandbox = {
        window: {
            location: {
                hostname: 'www.cardtrader.com',
                pathname: '/en/cards/99999-hypno-wizards-of-the-coast-era-promos',
                href: 'https://www.cardtrader.com/en/cards/99999-hypno-wizards-of-the-coast-era-promos',
            },
        },
        document: {
            title: 'Hypno Wizards of the Coast Era Promos | Pokémon',
            querySelector(selector) {
                if (selector === '[data-pokoin-cardtrader-button]') return null;
                if (selector === '.py-3.text-center.text-sm-left') return titleBlock;
                if (selector === '.py-3.text-center.text-sm-left h2, h1, h2') return titleElement;
                return null;
            },
            createElement(tagName) {
                return {
                    tagName: tagName.toUpperCase(),
                    style: {},
                    attributes: {},
                    setAttribute(name, value) {
                        this.attributes[name] = value;
                    },
                    querySelector: () => ({ style: {} }),
                    addEventListener(type, listener, options) {
                        listeners[type] = { listener, options };
                    },
                };
            },
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: (message) => {
                    messages.push(message);
                    return sendMessagePromise;
                },
            },
        },
        console: { log() {}, warn() {}, error() {} },
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(`${functions}\nthis.patchCardTraderCardPage = patchCardTraderCardPage;`, sandbox, { filename: 'content.js' });

    sandbox.patchCardTraderCardPage();
    const event = {
        defaultPrevented: false,
        propagationStopped: false,
        immediatePropagationStopped: false,
        preventDefault() {
            this.defaultPrevented = true;
        },
        stopPropagation() {
            this.propagationStopped = true;
        },
        stopImmediatePropagation() {
            this.immediatePropagationStopped = true;
        },
    };
    const firstClick = listeners.click.listener(event);
    const secondClick = listeners.click.listener(event);
    assert.equal(messages.length, 1);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
    assert.equal(event.immediatePropagationStopped, true);
    assert.equal(messages[0].action, 'openSidePanelForCurrentTab');
    assert.equal(messages[0].cardtraderBlueprintId, '99999');
    assert.equal(messages[0].title, 'Hypno Wizards of the Coast Era Promos');

    resolveSendMessage({ success: true });
    await Promise.all([firstClick, secondClick]);
});

test('content legacy gray buttons attach side-panel click before search results', async () => {
    const source = readRepoFile('content.js');
    const contentStart = source.indexOf('function pokoinIconUrl');
    const functions = [
        extractFunctionSource(source, 'extractCardTraderBlueprintId', contentStart),
        extractFunctionSource(source, 'cardTraderDirectTitle', contentStart),
        extractFunctionSource(source, 'openPokoinSidePanel', contentStart),
        extractFunctionSource(source, 'attachPokoinSidePanelClick', contentStart),
    ].join('\n');
    const messages = [];
    const listeners = {};
    const sandbox = {
        window: {
            location: {
                hostname: 'www.ebay.com',
                pathname: '/itm/123',
                href: 'https://www.ebay.com/itm/123',
            },
        },
        document: {
            title: 'Dragonite V Pokemon card',
            querySelector: () => null,
        },
        chrome: {
            runtime: {
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true };
                },
            },
        },
        console: { warn() {} },
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(`${functions}\nthis.attachPokoinSidePanelClick = attachPokoinSidePanelClick;`, sandbox, { filename: 'content.js' });

    const button = {
        addEventListener(type, listener) {
            listeners[type] = listener;
        },
    };
    sandbox.attachPokoinSidePanelClick(button);
    await listeners.click({
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {},
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].action, 'openSidePanelForCurrentTab');
    assert.equal(messages[0].url, 'https://www.ebay.com/itm/123');
    assert.equal(messages[0].title, 'Dragonite V Pokemon card');
});

test('site processors use background fallback and side-panel opening', async () => {
    for (const [relativePath, className] of [
        ['processors/EBAYE.js', 'EbayProcessor'],
        ['processors/CME.js', 'CardmarketProcessor'],
    ]) {
        const messages = [];
        const { Processor } = loadProcessor(relativePath, className, {
            window: {
                location: { href: 'https://example.test/item', hostname: 'example.test' },
                searchCardInDatabase: async () => [],
            },
            chrome: {
                runtime: {
                    getURL: (asset) => `chrome-extension://test/${asset}`,
                    sendMessage: async (message) => {
                        messages.push(message);
                        if (message.action === 'searchCardForTitle') {
                            return { success: true, results: [{ name_en: 'Candidate', search_score: 80 }] };
                        }
                        return { success: true };
                    },
                },
            },
        });

        const processor = new Processor();
        const results = await processor.searchCardInDatabase({ pokemonName: 'Candidate' }, 'Candidate Pokemon');
        await processor.openPokoinSidePanel();

        assert.equal(results.length, 1, `${className} should use background search fallback`);
        assert.equal(messages[0].action, 'searchCardForTitle');
        assert.equal(messages.at(-1).action, 'openSidePanelForCurrentTab');
    }
});

test('eBay side-panel open passes button preview rows', async () => {
    const messages = [];
    const { Processor } = loadProcessor('processors/EBAYE.js', 'EbayProcessor', {
        window: {
            location: { href: 'https://www.ebay.com/itm/555-tornadus-ex', hostname: 'www.ebay.com' },
        },
        document: {
            title: 'Tornadus EX Full Art Pokemon',
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body: { appendChild() {} },
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    if (message.action === 'searchCardForTitle') {
                        return {
                            success: true,
                            results: [
                                { blueprint_id: '96', name_en: 'Tornadus EX', expansion_name_en: 'BW Black Star Promos', collector_number: '96', search_score: 99 },
                                { blueprint_id: '90', name_en: 'Tornadus EX', expansion_name_en: 'Dark Explorers', collector_number: '90', search_score: 95 },
                            ],
                        };
                    }
                    return { success: true };
                },
            },
        },
    });
    const processor = new Processor();

    await processor.searchCardInDatabase({}, 'Tornadus EX Full Art Pokemon');
    await processor.openPokoinSidePanel();

    const openMessage = messages.at(-1);
    assert.equal(openMessage.action, 'openSidePanelForCurrentTab');
    assert.equal(openMessage.title, 'Tornadus ex illustration');
    assert.deepEqual(openMessage.previewRows.map((row) => row.card_id), ['96', '90']);
    assert.deepEqual(openMessage.previewRows.map((row) => row.set_name), ['BW Black Star Promos', 'Dark Explorers']);
    assert.match(openMessage.previewSignature, /^ebay\|https:\/\/www\.ebay\.com\/itm\/555-tornadus-ex\|tornadusexillustration/);
    assert.equal(openMessage.previewSource, 'ebay_button_preview');
    assert.equal(openMessage.ebayPayload.source, 'ebay');
});

test('Cardmarket side-panel open passes button preview rows', async () => {
    const messages = [];
    const cardmarketUrl = 'https://www.cardmarket.com/it/Pokemon/Products/Singles/Caos-Nascente/Cinccino-ex-CRI119';
    const { Processor } = loadProcessor('processors/CME.js', 'CardmarketProcessor', {
        window: {
            location: { href: cardmarketUrl, hostname: 'www.cardmarket.com' },
        },
        document: {
            title: 'Cinccino ex (CRI 119)',
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body: { appendChild() {} },
        },
        chrome: {
            runtime: {
                getURL: (asset) => `chrome-extension://test/${asset}`,
                sendMessage: async (message) => {
                    messages.push(message);
                    if (message.action === 'searchCardForTitle') {
                        return {
                            success: true,
                            results: [
                                { blueprint_id: 'cinccino-cri-119', name_en: 'Cinccino ex', expansion_name_en: 'Caos Nascente', collector_number: '119', search_score: 99 },
                            ],
                        };
                    }
                    return { success: true };
                },
            },
        },
    });
    const processor = new Processor();
    const context = {
        title: 'Cinccino ex (CRI 119)',
        details: { number: 'CRI 119', expansion: 'Caos Nascente' },
        key: cardmarketUrl,
    };

    const results = await processor.searchProductWithBackground(context);
    processor.productPreviewRowsByKey.set(context.key, results);
    await processor.openProductSidePanel(context);

    const openMessage = messages.at(-1);
    assert.equal(openMessage.action, 'openSidePanelForCurrentTab');
    assert.equal(openMessage.title, 'Cinccino ex (CRI 119)');
    assert.deepEqual(openMessage.previewRows.map((row) => row.card_id), ['cinccino-cri-119']);
    assert.equal(openMessage.previewSource, 'cardmarket_button');
    assert.match(openMessage.previewSignature, /^cardmarket\|https:\/\/www\.cardmarket\.com/);
});

test('eBay and Cardmarket gray buttons open the side panel before matches resolve', () => {
    for (const [relativePath, className] of [
        ['processors/EBAYE.js', 'EbayProcessor'],
        ['processors/CME.js', 'CardmarketProcessor'],
    ]) {
        const messages = [];
        const listeners = {};
        const { Processor } = loadProcessor(relativePath, className, {
            window: {
                location: { href: 'https://example.test/item', hostname: 'example.test' },
            },
            chrome: {
                runtime: {
                    getURL: (asset) => `chrome-extension://test/${asset}`,
                    sendMessage: async (message) => {
                        messages.push(message);
                        return { success: true };
                    },
                },
            },
        });
        const processor = new Processor();
        const button = createButtonStub();
        button.addEventListener = (type, listener) => {
            listeners[type] = listener;
        };

        processor.attachSidePanelClick(button);
        listeners.click({
            preventDefault() {},
            stopPropagation() {},
        });

        assert.equal(messages.length, 1, `${className} gray button should open side panel`);
        assert.equal(messages[0].action, 'openSidePanelForCurrentTab');
    }
});

test('visible Best candidates headings are removed from side panel and Vinted preview', () => {
    const sidePanelHtml = readRepoFile('ui-pages/sidepanel.html');
    const vintedSource = readRepoFile('processors/VINT.js');

    assert.doesNotMatch(sidePanelHtml, />\s*Best candidates\s*</i);
    assert.doesNotMatch(vintedSource, /textContent\s*=\s*['"]Best candidates['"]/);
    assert.match(sidePanelHtml, /candidateList/, 'candidate list container should remain');
    assert.match(vintedSource, /results\.slice\(0,\s*8\)/, 'candidate preview should still render candidates');
});

test('side panel runtime marker is not rendered visibly', () => {
    const sidePanelHtml = readRepoFile('ui-pages/sidepanel.html');
    const sidePanelCss = readRepoFile('ui-pages/sidepanel.css');
    const sidePanelSource = readRepoFile('ui-pages/sidepanel.js');

    assert.doesNotMatch(sidePanelHtml, /id="runtimeInfo"|id="debugInfo"|class="panel-footer"|Build information/i);
    assert.doesNotMatch(sidePanelCss, /\.runtime-info|\.panel-footer/);
    assert.doesNotMatch(sidePanelSource, /runtimeInfo|debugInfo|formatPhaseTimings/);
});

test('all marketplace buttons use the side panel message workflow', () => {
    for (const relativePath of ['content.js', 'processors/VINT.js', 'processors/EBAYE.js', 'processors/CME.js']) {
        const source = readRepoFile(relativePath);
        assert.match(source, /openSidePanelForCurrentTab/, `${relativePath} should send side-panel open message`);
        assert.doesNotMatch(source, /window\.open\(/, `${relativePath} should not open marketplace cards in a new tab`);
    }
});

test('Pokoin auth bridge forwards only same-origin token messages', async () => {
    const { sandbox, messages, postedMessages, messageListener } = loadPokoinAuthBridge();

    assert.equal(postedMessages[0].targetOrigin, 'https://pokoin.com');
    assert.equal(postedMessages[0].message.type, 'POKOIN_EXTENSION_AUTH_TOKEN_REQUEST');

    await messageListener({
        origin: 'https://evil.example',
        source: sandbox.window,
        data: {
            type: 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE',
            token: 'x'.repeat(40),
        },
    });
    await messageListener({
        origin: 'https://pokoin.com',
        source: {},
        data: {
            type: 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE',
            token: 'x'.repeat(40),
        },
    });
    await messageListener({
        origin: 'https://pokoin.com',
        source: sandbox.window,
        data: {
            type: 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE',
            token: 'firebase-token-from-pokoin-bridge',
            expiresAt: Date.now() + 600000,
        },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].action, 'pokoinAuthTokenReceived');
    assert.equal(messages[0].tokenMessage.token, 'firebase-token-from-pokoin-bridge');
});

test('Pokoin auth bridge accepts current Pokoin web token payload', async () => {
    const { sandbox, messages, messageListener } = loadPokoinAuthBridge();

    await messageListener({
        origin: 'https://pokoin.com',
        source: sandbox.window,
        data: {
            type: 'pokoin-auth-token',
            ok: true,
            token: {
                accessToken: 'firebase-token-from-current-pokoin-web-message',
                expiresAt: Date.now() + 600000,
                issuedAt: Date.now(),
                uid: 'pokoin-user-id',
                email: 'user@example.com',
            },
        },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].action, 'pokoinAuthTokenReceived');
    assert.equal(messages[0].tokenMessage.type, 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE');
    assert.equal(messages[0].tokenMessage.token, 'firebase-token-from-current-pokoin-web-message');
    assert.equal(messages[0].tokenMessage.uid, 'pokoin-user-id');
    assert.equal(messages[0].tokenMessage.email, 'user@example.com');
});

test('Pokoin auth bridge accepts JSON string token payload', async () => {
    const { sandbox, messages, messageListener } = loadPokoinAuthBridge();

    await messageListener({
        origin: 'https://pokoin.com',
        source: sandbox.window,
        data: JSON.stringify({
            type: 'pokoin-auth-token',
            ok: true,
            token: {
                accessToken: 'firebase-token-from-json-pokoin-web-message',
                expirationTime: Date.now() + 600000,
            },
        }),
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].action, 'pokoinAuthTokenReceived');
    assert.equal(messages[0].tokenMessage.type, 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE');
    assert.equal(messages[0].tokenMessage.token, 'firebase-token-from-json-pokoin-web-message');
});

test('Pokoin auth bridge rejects old and malformed token payloads', async () => {
    const { sandbox, messages, messageListener } = loadPokoinAuthBridge();

    await messageListener({
        origin: 'https://pokoin.com',
        source: sandbox.window,
        data: {
            type: 'pokoin-auth-token',
            ok: true,
            token: {
                token: 'legacy-token-field-should-not-be-accepted',
            },
        },
    });
    await messageListener({
        origin: 'https://pokoin.com',
        source: sandbox.window,
        data: '{"type":"pokoin-auth-token","ok":true,"token":',
    });
    await messageListener({
        origin: 'https://pokoin.com',
        source: sandbox.window,
        data: {
            type: 'pokoin-auth-token',
            ok: true,
            token: {
                accessToken: 'short',
            },
        },
    });

    assert.equal(messages.length, 0);
});

test('Pokoin auth token validation stores session token only', async () => {
    const sessionWrites = [];
    const localWrites = [];
    const sandbox = loadBackgroundHelpers(['storePokoinAuthToken']);
    sandbox.chrome.storage.session.set = async (payload) => {
        sessionWrites.push(payload);
    };
    sandbox.chrome.storage.local.set = async (payload) => {
        localWrites.push(payload);
    };

    const invalid = await sandbox.storePokoinAuthToken({
        type: 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE',
        token: 'short',
    });
    const valid = await sandbox.storePokoinAuthToken({
        type: 'POKOIN_EXTENSION_AUTH_TOKEN_RESPONSE',
        token: 'firebase-id-token-from-pokoin-current-user',
        expiresAt: Date.now() + 600000,
    });

    assert.equal(invalid.valid, false);
    assert.equal(valid.valid, true);
    assert.equal(sessionWrites.length, 1);
    assert.ok(sessionWrites[0].pokoinAuthSession.token);
    assert.equal(localWrites.length, 0, 'auth token must never be written to local storage');
});

test('Cardmarket observation queues and opens auth bridge when token is missing', async () => {
    const sessionState = {};
    const createdTabs = [];
    const sandbox = loadBackgroundHelpers(['sendCardmarketObservation']);
    sandbox.fetch = async () => {
        throw new Error('request should wait for auth token');
    };
    sandbox.chrome.storage.session.get = async (key) => {
        if (key === 'pokoinAuthSession') {
            return { pokoinAuthSession: sessionState.pokoinAuthSession };
        }
        if (key === 'pendingCardmarketObservations') {
            return { pendingCardmarketObservations: sessionState.pendingCardmarketObservations || [] };
        }
        return {};
    };
    sandbox.chrome.storage.session.set = async (payload) => {
        Object.assign(sessionState, payload);
    };
    sandbox.chrome.tabs.query = async () => [];
    sandbox.chrome.tabs.create = async (payload) => {
        createdTabs.push(payload);
        return { id: 99, ...payload };
    };

    const result = await sandbox.sendCardmarketObservation({
        structuredCard: { name: 'Piplup', collectorNumber: 'MEP 042', expansion: 'MEP Black Star Promos' },
        cardmarketContext: { url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042' },
        match: { cardId: 'mep-042', name: 'Piplup' },
        promoteVerifiedLink: false,
    });

    assert.equal(result.queued, true);
    assert.equal(result.reason, 'missing_token');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(createdTabs.length, 1);
    assert.equal(createdTabs[0].url, 'https://pokoin.com/extension/auth-bridge');
    assert.equal(createdTabs[0].active, false);
    assert.equal(sessionState.pendingCardmarketObservations.length, 1);
});

test('valid Pokoin session token skips auth bridge request', async () => {
    const sandbox = loadBackgroundHelpers(['requestPokoinAuthToken']);
    let tabQueryCount = 0;
    let tabCreateCount = 0;
    sandbox.chrome.storage.session.get = async (key) => {
        if (key === 'pokoinAuthSession') {
            return {
                pokoinAuthSession: {
                    token: 'valid-firebase-id-token-from-session',
                    expiresAt: Date.now() + 600000,
                },
            };
        }
        return {};
    };
    sandbox.chrome.tabs.query = async () => {
        tabQueryCount += 1;
        return [];
    };
    sandbox.chrome.tabs.create = async () => {
        tabCreateCount += 1;
        return { id: 99 };
    };

    const result = await sandbox.requestPokoinAuthToken();

    assert.equal(result.token, 'valid-firebase-id-token-from-session');
    assert.equal(result.openedBridge, false);
    assert.equal(result.reusedSession, true);
    assert.equal(tabQueryCount, 0);
    assert.equal(tabCreateCount, 0);
});

test('concurrent Cardmarket observations share one auth bridge request', async () => {
    const sessionState = {};
    const createdTabs = [];
    const sandbox = loadBackgroundHelpers(['sendCardmarketObservation']);
    sandbox.fetch = async () => {
        throw new Error('request should wait for auth token');
    };
    sandbox.chrome.storage.session.get = async (key) => {
        if (key === 'pokoinAuthSession') {
            return { pokoinAuthSession: sessionState.pokoinAuthSession };
        }
        if (key === 'pendingCardmarketObservations') {
            return { pendingCardmarketObservations: sessionState.pendingCardmarketObservations || [] };
        }
        return {};
    };
    sandbox.chrome.storage.session.set = async (payload) => {
        Object.assign(sessionState, payload);
    };
    sandbox.chrome.tabs.query = async () => [];
    sandbox.chrome.tabs.create = async (payload) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        createdTabs.push(payload);
        return { id: 99, ...payload };
    };

    const basePayload = {
        cardmarketContext: { url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Skyridge/Golem-SK148' },
        promoteVerifiedLink: false,
    };
    const [first, second] = await Promise.all([
        sandbox.sendCardmarketObservation({
            ...basePayload,
            structuredCard: { name: 'Golem', collectorNumber: 'SK 148', expansion: 'Skyridge' },
            match: { cardId: 'sk-148', name: 'Golem' },
        }),
        sandbox.sendCardmarketObservation({
            ...basePayload,
            structuredCard: { name: 'Golem', collectorNumber: 'SK 148 Holo', expansion: 'Skyridge' },
            match: { cardId: 'sk-148-holo', name: 'Golem' },
        }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(first.queued, true);
    assert.equal(second.queued, true);
    assert.equal(createdTabs.length, 1);
    assert.equal(sessionState.pendingCardmarketObservations.length, 2);
});

test('Cardmarket observation POST uses bearer auth payload and de-dupes signature', async () => {
    const fetchCalls = [];
    const sandbox = loadBackgroundHelpers(['sendCardmarketObservation']);
    sandbox.chrome.storage.session.get = async (key) => {
        if (key === 'pokoinAuthSession') {
            return {
                pokoinAuthSession: {
                    token: 'valid-firebase-id-token-from-session',
                    expiresAt: Date.now() + 600000,
                },
            };
        }
        return {};
    };
    sandbox.chrome.storage.session.set = async () => {};
    sandbox.fetch = async (url, options = {}) => {
        fetchCalls.push({ url, options, body: JSON.parse(options.body || '{}') });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };

    const payload = {
        structuredCard: { name: 'Piplup', collectorNumber: 'MEP 042', expansion: 'MEP Black Star Promos' },
        cardmarketContext: {
            url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
            title: 'Piplup (MEP 042)',
        },
        match: { cardId: 'mep-042', name: 'Piplup', expansionName: 'MEP Black Star Promos', collectorNumber: 'MEP 042' },
        promoteVerifiedLink: false,
    };

    const first = await sandbox.sendCardmarketObservation(payload);
    const second = await sandbox.sendCardmarketObservation({ ...payload });

    assert.equal(first.success, true);
    assert.equal(second.deduped, true);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://pokoin.com/api/cardmarket-scrape-observation');
    assert.equal(fetchCalls[0].options.headers.authorization, 'Bearer valid-firebase-id-token-from-session');
    assert.equal(fetchCalls[0].body.structuredCard.name, 'Piplup');
    assert.equal(fetchCalls[0].body.cardmarketContext.url, payload.cardmarketContext.url);
    assert.equal(fetchCalls[0].body.match.cardId, 'mep-042');
    assert.equal(fetchCalls[0].body.promoteVerifiedLink, false);
});

test('Cardmarket observation payload includes top-level page URL metadata', () => {
    const sandbox = loadBackgroundHelpers(['buildCardmarketObservationPayload']);
    const url = 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Dragon-Majesty/Hydreigon-DRM33';

    const payload = sandbox.buildCardmarketObservationPayload({
        pageInfo: {
            url,
            title: 'Hydreigon (DRM 33)',
            hostname: 'www.cardmarket.com',
            structuredCard: {
                rawTitle: 'Hydreigon (DRM 33)',
                name: 'Hydreigon',
                collectorNumber: 'DRM 33',
                numericCollectorNumber: '33',
                expansion: 'Dragon Majesty',
            },
        },
        best: {
            card_id: '114322',
            name: 'Hydreigon',
            set_name: 'Dragon Majesty',
            card_number: 'DRM 33',
            search_rank: 98,
        },
    });

    assert.equal(payload.url, url);
    assert.equal(payload.title, 'Hydreigon (DRM 33)');
    assert.equal(payload.hostname, 'www.cardmarket.com');
    assert.equal(payload.source, 'pokemon-card-extension');
    assert.equal(payload.extensionVersion, '2.0.0');
    assert.equal(payload.structuredCard.name, 'Hydreigon');
    assert.equal(payload.cardmarketContext.url, url);
    assert.equal(payload.match.cardId, '114322');
    assert.equal(payload.promoteVerifiedLink, false);
});

test('Cardmarket observation with missing token queues without blocking matching state', async () => {
    const source = readRepoFile('config/background.js');
    const storage = {};
    const storageWrites = [];
    let bridgeOpened = false;
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url) => {
            if (url.includes('/api/marketplace-blueprint-price')) {
                return { ok: true, json: async () => ({ products: [] }) };
            }
            if (url.includes('/api/extension-card-search')) {
                return {
                    ok: true,
                    json: async () => ({
                        matches: [{
                            cardId: 'sk-148',
                            name: 'Golem',
                            expansionName: 'Skyridge',
                            collectorNumber: 'SK 148',
                            score: 100,
                        }],
                    }),
                };
            }
            throw new Error(`Unexpected fetch before auth: ${url}`);
        },
        chrome: {
            runtime: {
                onMessage: { addListener() {} },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                query: async () => [],
                create: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 20));
                    bridgeOpened = true;
                    return { id: 99 };
                },
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: {
                executeScript: async () => [{
                    result: {
                        title: 'Golem (SK 148)',
                        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Skyridge/Golem-SK148',
                        hostname: 'www.cardmarket.com',
                        structuredCard: {
                            rawTitle: 'Golem (SK 148)',
                            name: 'Golem',
                            searchName: 'Golem',
                            collectorNumber: 'SK 148',
                            numericCollectorNumber: '148',
                            expansion: 'Skyridge',
                        },
                    },
                }],
            },
            storage: {
                session: {
                    get: async (key) => {
                        if (typeof key === 'string') return { [key]: storage[key] };
                        if (Array.isArray(key)) return Object.fromEntries(key.map((entry) => [entry, storage[entry]]));
                        return { ...storage };
                    },
                    set: async (payload) => {
                        Object.assign(storage, payload);
                        if (payload.sidePanelState) storageWrites.push(payload.sidePanelState);
                    },
                },
                local: { set: async () => {} },
            },
            sidePanel: { setPanelBehavior: () => ({ catch() {} }) },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${source}\nthis.resolveActiveTabForSidePanel = resolveActiveTabForSidePanel;`, sandbox, { filename: 'config/background.js' });

    const result = await sandbox.resolveActiveTabForSidePanel({
        id: 8,
        title: 'Golem (SK 148)',
        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Skyridge/Golem-SK148',
    });

    assert.equal(result.blueprintId, 'sk-148');
    assert.equal(storage.sidePanelState.blueprintId, 'sk-148');
    assert.equal(storage.sidePanelState.loading, undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(storage.pendingCardmarketObservations.length, 1);
    assert.equal(bridgeOpened, false);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(bridgeOpened, true);
});

test('Cardmarket selected side-panel candidate promotes verified link', async () => {
    const source = readRepoFile('config/background.js');
    let messageListener = null;
    const fetchCalls = [];
    const storageState = {
        pokoinAuthSession: {
            token: 'valid-firebase-id-token-from-session',
            expiresAt: Date.now() + 600000,
        },
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        URL,
        setTimeout,
        clearTimeout,
        fetch: async (url, options = {}) => {
            fetchCalls.push({ url, options, body: JSON.parse(options.body || '{}') });
            return { ok: true, status: 200, json: async () => ({ ok: true }) };
        },
        chrome: {
            runtime: {
                onMessage: {
                    addListener(listener) {
                        messageListener = listener;
                    },
                },
                onInstalled: { addListener() {} },
                onStartup: { addListener() {} },
            },
            tabs: {
                get: async () => ({
                    id: 8,
                    title: 'Piplup (MEP 042)',
                    url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
                }),
                query: async () => [],
                onUpdated: { addListener() {} },
                onActivated: { addListener() {} },
            },
            scripting: { executeScript: async () => [] },
            storage: {
                session: {
                    get: async (key) => {
                        if (key === 'pokoinAuthSession') return { pokoinAuthSession: storageState.pokoinAuthSession };
                        return {};
                    },
                    set: async (payload) => Object.assign(storageState, payload),
                },
                local: { set: async () => {} },
            },
            sidePanel: {
                open: async () => {},
                setPanelBehavior: () => ({ catch() {} }),
            },
            action: { setIcon: async () => {}, onClicked: { addListener() {} } },
        },
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'config/background.js' });

    const response = await new Promise((resolve) => {
        messageListener(
            {
                action: 'openSidePanelForCurrentTab',
                url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
                title: 'Piplup (MEP 042)',
                selectedCandidateId: 'mep-042',
                selectedCandidate: {
                    card_id: 'mep-042',
                    name: 'Piplup',
                    set_name: 'MEP Black Star Promos',
                    card_number: 'MEP 042',
                    search_rank: 99,
                },
            },
            { tab: { id: 8 } },
            resolve
        );
    });

    assert.equal(response.success, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const observation = fetchCalls.find((call) => call.url.includes('/api/cardmarket-scrape-observation'));
    assert.ok(observation);
    assert.equal(observation.body.promoteVerifiedLink, true);
    assert.equal(observation.body.cardmarketContext.url, 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042');
    assert.equal(observation.body.match.cardId, 'mep-042');
});

test('Cardmarket side-panel write keeps exact state over weaker same-URL update', async () => {
    const writes = [];
    const exactState = {
        updatedAt: Date.now(),
        pageInfo: {
            title: 'Piplup (MEP 042)',
            url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
            structuredCard: {
                name: 'Piplup',
                collectorNumber: 'MEP 042',
                expansion: 'MEP Black Star Promos',
            },
        },
        best: { card_id: 'mep-042', name: 'Piplup' },
        blueprintId: 'mep-042',
        debug: { buildMarker: '2.0.0-runtime-divergence-guard' },
    };
    const sandbox = loadBackgroundHelpers(['setSidePanelState']);
    sandbox.chrome.storage.session.get = async () => ({ sidePanelState: exactState });
    sandbox.chrome.storage.session.set = async (payload) => writes.push(payload);

    const retained = await sandbox.setSidePanelState({
        updatedAt: Date.now() + 1,
        pageInfo: {
            title: 'Piplup',
            url: exactState.pageInfo.url,
            structuredCard: { name: 'Piplup' },
        },
        best: { card_id: 'sc-006', name: 'Piplup', set_name: 'Stellar Crown', card_number: '006/142' },
        blueprintId: 'sc-006',
        debug: {},
    });

    assert.equal(retained, exactState);
    assert.equal(writes.length, 0, 'weaker title-only state should not overwrite exact Cardmarket state');
});

test('Cardmarket URL product slug restores exact identity when page scrape is degraded', async () => {
    const sandbox = loadBackgroundHelpers(['getActivePageInfo']);
    sandbox.chrome.scripting.executeScript = async () => [{
        result: {
            title: 'Piplup',
            url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
            hostname: 'www.cardmarket.com',
            structuredCard: { name: 'Piplup' },
            debug: { titleSource: 'degraded-title-only' },
        },
    }];

    const pageInfo = await sandbox.getActivePageInfo({
        id: 8,
        title: 'Piplup',
        url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/MEP-Black-Star-Promos/Piplup-MEP042',
    });

    assert.equal(pageInfo.title, 'Piplup (MEP 042)');
    assert.equal(pageInfo.structuredCard.name, 'Piplup');
    assert.equal(pageInfo.structuredCard.collectorNumber, 'MEP 042');
    assert.equal(pageInfo.structuredCard.expansion, 'MEP Black Star Promos');
    assert.equal(pageInfo.debug.titleSource, 'cardmarket-url-product-slug');
});

test('runtime version change invalidates stale session side-panel state', async () => {
    const writes = [];
    const sandbox = loadBackgroundHelpers(['ensureRuntimeStorageCurrent']);
    sandbox.chrome.storage.session.get = async () => ({
        pokoinExtensionRuntime: { buildMarker: 'old-build' },
        sidePanelState: {
            pageInfo: {
                title: 'Piplup',
                url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Stellar-Crown/Piplup-006',
                hostname: 'www.cardmarket.com',
            },
            best: { card_id: 'sc-006' },
            blueprintId: 'sc-006',
        },
    });
    sandbox.chrome.storage.session.set = async (payload) => writes.push(payload);

    await sandbox.ensureRuntimeStorageCurrent();

    assert.equal(writes.length, 1);
    assert.equal(writes[0].pokoinExtensionRuntime.buildMarker, '2.0.0-runtime-divergence-guard');
    assert.equal(writes[0].sidePanelState.blueprintId, '');
    assert.equal(writes[0].sidePanelState.pageInfo.url, '');
    assert.equal(writes[0].sidePanelState.debug.invalidatedPreviousBuildMarker, 'old-build');
});

test('content Cardmarket legacy fallback is disabled and cannot send title-only search', () => {
    const source = readRepoFile('content.js');
    const fallback = extractFunctionSource(source, 'patchCardmarketProductPage');

    assert.match(fallback, /Legacy Cardmarket product-page fallback is disabled/);
    assert.doesNotMatch(fallback, /searchCardInDatabase\(|searchCardForTitle/);
});

test('manifest and UI icon asset references exist and are size-constrained', () => {
    const manifest = JSON.parse(readRepoFile('manifest.json'));
    const manifestIconPaths = [
        ...Object.values(manifest.icons || {}),
        ...Object.values(manifest.action?.default_icon || {}),
    ];
    const webAssets = (manifest.web_accessible_resources || [])
        .flatMap((entry) => entry.resources || []);
    [...manifestIconPaths, ...webAssets].forEach((relativePath) => {
        assert.equal(fs.existsSync(path.join(REPO_ROOT, relativePath)), true, `${relativePath} should exist`);
    });

    const sidePanelCss = readRepoFile('ui-pages/sidepanel.css');
    assert.match(sidePanelCss, /\.brand-icon\s*\{[^}]*width:\s*34px[^}]*height:\s*34px[^}]*object-fit:\s*contain/s);
    assert.match(sidePanelCss, /\.candidate-logo\s*\{[^}]*max-width:\s*42px[^}]*max-height:\s*42px[^}]*object-fit:\s*contain/s);

    ['content.js', 'processors/VINT.js', 'processors/EBAYE.js', 'processors/CME.js'].forEach((relativePath) => {
        const source = readRepoFile(relativePath);
        assert.match(source, /assets\/pokoin-512\.png/, `${relativePath} should use the packaged Pokoin asset`);
        assert.match(source, /objectFit:\s*'cover'/, `${relativePath} should constrain Pokoin button object fit`);
        assert.match(source, /maxWidth:\s*'2[02]px'/, `${relativePath} should cap Pokoin button icon width`);
    });
});

test('dist zip includes current runtime files without stale backups', () => {
    const { execFileSync } = require('node:child_process');
    const crypto = require('node:crypto');
    const entries = execFileSync('unzip', ['-l', path.join(REPO_ROOT, 'dist/pokemon-card-extension-2.0.0.zip')], { encoding: 'utf8' });
    const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

    [
        'manifest.json',
        'content.js',
        'config/background.js',
        'processors/CME.js',
        'ui-pages/sidepanel.js',
        'ui-pages/sidepanel.html',
    ].forEach((entry) => assert.match(entries, new RegExp(`\\b${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)));
    assert.doesNotMatch(entries, /\b(?:backup|old|legacy|copy|~)\b/i);

    [
        'manifest.json',
        'content.js',
        'config/background.js',
        'processors/CME.js',
        'ui-pages/sidepanel.js',
        'ui-pages/sidepanel.html',
        'ui-pages/sidepanel.css',
    ].forEach((entry) => {
        const sourceHash = hash(readRepoFile(entry));
        const zipContent = execFileSync('unzip', ['-p', path.join(REPO_ROOT, 'dist/pokemon-card-extension-2.0.0.zip'), entry], { encoding: 'utf8' });
        assert.equal(hash(zipContent), sourceHash, `${entry} in dist zip should match source`);
    });
});
