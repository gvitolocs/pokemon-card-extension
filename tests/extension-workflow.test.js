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
    assert.equal(chromeMessages.at(-1).action, 'searchCardForTitle');
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

test('Vinted fullart title normalizes to manual illustration clue', async () => {
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

    assert.ok(processor.currentKeywords.some((keyword) => keyword.value === 'illustration' && keyword.selectedByDefault === false));
    assert.ok(!processor.currentKeywords.some((keyword) => /Fullart Scrivimi/i.test(keyword.value)));
    assert.deepEqual([...messages[0].primaryClues], ['Froslass']);
    assert.deepEqual(Array.from(messages[0].clues), ['Froslass']);
    assert.equal(messages[0].title, 'Froslass');
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

    assert.equal(messages.length, 2, 'toggle should send one new background search');
    assert.deepEqual([...messages[0].clues], ['Pikachu']);
    assert.deepEqual([...messages[1].clues], ['Pikachu', '35/108']);
    assert.match(messages[1].title, /35\/108/);
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
    assert.equal(processor.currentPanelHost.style.left, '16px');
    assert.equal(processor.currentPanelHost.style.top, '48px');
    assert.equal(processor.currentPanelHost.style.bottom, '24px');
    assert.equal(processor.currentPanelHost.style.right, 'auto');
    assert.equal(processor.currentPanelHost.style.maxHeight, 'calc(100vh - 72px)');
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
    assert.match(processor.currentButton.innerHTML, /Pokoin\.com/);
    assert.doesNotMatch(processor.currentButton.innerHTML, /\(\d+\)/);

    processor.setVintedOverlayCollapsed(true);
    assert.equal(processor.currentPanelHost.attributes['data-pokoin-vinted-collapsed'], 'true');
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
    assert.match(processor.currentButton.innerHTML, /Pokoin\.com/);
    assert.doesNotMatch(processor.currentButton.innerHTML, /1 match/);
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
    const button = createButtonStub();
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
    assert.equal(processor.currentButton.innerHTML.includes('Pokoin.com'), true);
    assert.equal(processor.currentButton.innerHTML.includes('(1)'), false);
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
    assert.match(resetStyles, /\[data-pokoin-button-icon\]/);
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
        ['processors/EBAYE.js', 'EbayProcessor', '22px'],
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
            if (url.includes('/api/cardtrader-redirect')) {
                return {
                    ok: true,
                    json: async () => ({
                        products: [{
                            price: { non_layered_price_formatted: '$3.21' },
                        }],
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
    assert.equal(response.results.length, 3);
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
                if (fetchUrl.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
    assert.equal(fetchCalls, 4, 'name resolution, structured search, fallback autocomplete, and async price enrichment should run once for duplicate requests');
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
                    { card_id: '96', name: 'Tornadus EX', set_name: 'BW Black Star Promos', card_number: '96', search_rank: 99, pokoin_price: '$1.00' },
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) return { ok: true, json: async () => ({ products: [] }) };
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
            if (url.includes('/api/cardtrader-redirect')) return { ok: true, json: async () => ({ products: [] }) };
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

    assert.equal(broadResult.blueprintId, 'broad');
    assert.deepEqual(storage.sidePanelState.rows.map((row) => row.card_id), ['96', '90']);
    assert.equal(storage.sidePanelState.debug.pinnedPreviewRows, true);
    assert.equal(storage.sidePanelState.debug.previewSource, 'vinted_overlay');
    assert.deepEqual(storageWrites.at(-1).rows.map((row) => row.card_id), ['96', '90']);
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
            if (url.includes('/api/cardtrader-redirect')) {
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
            if (url.includes('/api/cardtrader-redirect')) {
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
    assert.equal(openMessage.title, 'Tornadus EX Full Art Pokemon');
    assert.deepEqual(openMessage.previewRows.map((row) => row.card_id), ['96', '90']);
    assert.deepEqual(openMessage.previewRows.map((row) => row.set_name), ['BW Black Star Promos', 'Dark Explorers']);
    assert.match(openMessage.previewSignature, /^ebay\|https:\/\/www\.ebay\.com\/itm\/555-tornadus-ex$/);
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

test('all marketplace buttons use the side panel message workflow', () => {
    for (const relativePath of ['content.js', 'processors/VINT.js', 'processors/EBAYE.js', 'processors/CME.js']) {
        const source = readRepoFile(relativePath);
        assert.match(source, /openSidePanelForCurrentTab/, `${relativePath} should send side-panel open message`);
        assert.doesNotMatch(source, /window\.open\(/, `${relativePath} should not open marketplace cards in a new tab`);
    }
});

test('Pokoin auth bridge forwards only same-origin token messages', async () => {
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
        },
        chrome: {
            runtime: {
                sendMessage: async (message) => {
                    messages.push(message);
                    return { success: true };
                },
            },
        },
    };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'pokoin-auth-bridge.js' });

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
            if (url.includes('/api/cardtrader-redirect')) {
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
