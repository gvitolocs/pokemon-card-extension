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
        style: {},
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
        style: {},
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
    assert.equal(processor.currentButton.style.background, '#28a745');
    assert.equal(messages.filter((message) => message.action === 'searchCardForTitle').length, 1);
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

test('Vinted keyword defaults select Pokemon-name-like clues only', () => {
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

test('Vinted placement prefers the product details/title container', () => {
    const bodyAppends = [];
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
            body: {
                appendChild(element) {
                    bodyAppends.push(element);
                    element.parentNode = this;
                    element.parentElement = this;
                },
            },
        },
    });
    const processor = new Processor();

    const panel = processor.ensureVintedPanel(title);

    assert.equal(panel.attributes['data-pokoin-extension-panel'], 'vinted-content');
    assert.equal(processor.currentPanelHost.attributes['data-pokoin-vinted-placement'], 'anchored');
    assert.equal(processor.currentPanelHost.attributes['data-pokoin-extension-panel'], 'vinted');
    assert.equal(processor.currentPanelHost.parentNode, details);
    assert.equal(details.children.indexOf(processor.currentPanelHost), details.children.indexOf(actionArea) - 1);
    assert.equal(bodyAppends.length, 0, 'anchored panel should not be fixed on body');
    assert.equal(processor.currentPanelHost.style.position, 'static');
    assert.ok(processor.currentPanelHost.shadowRoot, 'Vinted panel should use a shadow root when available');
});

test('Vinted fallback fixed panel is only used without a safe anchor', () => {
    const bodyAppends = [];
    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body: {
                appendChild(element) {
                    bodyAppends.push(element);
                    element.parentNode = this;
                    element.parentElement = this;
                },
            },
        },
    });
    const processor = new Processor();

    const panel = processor.ensureVintedPanel(null);

    assert.equal(processor.currentPanelHost.attributes['data-pokoin-vinted-placement'], 'fallback-fixed');
    assert.equal(processor.currentPanelHost.style.position, 'fixed');
    assert.equal(processor.currentPanelHost.style.left, '16px');
    assert.equal(processor.currentPanelHost.style.bottom, '16px');
    assert.equal(processor.currentPanelHost.style.right, 'auto');
    assert.equal(processor.currentPanelHost.style.top, 'auto');
    assert.equal(bodyAppends[0], processor.currentPanelHost);
});

test('Vinted chip and button share normal inserted details container', () => {
    const details = createDomElement('section', { 'data-testid': 'item-details' });
    const title = createDomElement('h1', { 'data-testid': 'item-title' });
    const actionArea = createDomElement('div', { 'data-testid': 'item-actions' });
    details.appendChild(title);
    details.appendChild(actionArea);

    const { Processor } = loadProcessor('processors/VINT.js', 'VintedProcessor', {
        window: {
            extractTitleInfo: () => ({ pokemonName: null }),
        },
        document: {
            querySelector: () => null,
            querySelectorAll: () => [],
            contains: () => true,
            createElement: (tagName) => createDomElement(tagName),
            body: {
                appendChild() {},
            },
        },
    });
    const processor = new Processor();
    processor.currentTitleElement = title;

    processor.createVintedPanelButton(title);
    processor.renderKeywordToggles('Carta Pokemon Dragonite', 'SWSH154 Evolving Skies');

    const host = details.children.find((child) => child.attributes['data-pokoin-vinted-panel-host'] === 'true');
    const panel = host.shadowRoot.querySelector('[data-pokoin-vinted-panel]');
    assert.ok(panel, 'panel should be inserted into item details');
    assert.equal(host.attributes['data-pokoin-vinted-placement'], 'anchored');
    assert.equal(host.style.position, 'static');
    assert.ok(panel.children.some((child) => child.attributes['data-pokemon-linker-button'] === 'true'));
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
            contains: (element) => details.contains(element),
            createElement: (tagName) => createDomElement(tagName),
            body: { appendChild() {} },
        },
    });
    const processor = new Processor();

    const firstPanel = processor.ensureVintedPanel(title);
    const firstHost = processor.currentPanelHost;
    const secondPanel = processor.ensureVintedPanel(title);

    assert.equal(secondPanel, firstPanel);
    assert.equal(processor.currentPanelHost, firstHost);
    assert.equal(details.querySelectorAll('[data-pokoin-vinted-panel-host]').length, 1);
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
    assert.equal(processor.currentPanelHost.parentNode, details);
    assert.equal(processor.currentPanelHost.attributes['data-pokoin-vinted-placement'], 'anchored');
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

test('Vinted background candidates turn button green and render preview', async () => {
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

    assert.equal(processor.currentButton.style.background, '#28a745');
    assert.equal(processor.currentButton.attributes['data-pokemon-linker-fallback'], undefined);
    assert.equal(appended.at(-1).previewResults[0].name_en, 'Dragonite V');
});

test('Cardmarket green button keeps compact icon dimensions after relabel', () => {
    const icon = { style: {} };
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
});

test('Cardmarket structured parser keeps card name ahead of expansion', () => {
    const source = readRepoFile('config/background.js');
    const cleanCardmarketText = extractFunctionSource(source, 'cleanCardmarketText');
    const removeNoise = extractFunctionSource(source, 'removeMarketplaceSearchNoise');
    const scrapeStructured = extractFunctionSource(source, 'scrapeStructuredCardFields');
    const compact = extractFunctionSource(source, 'compactSearchValue');
    const buildQueries = extractFunctionSource(source, 'buildCardvaultQueries');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(`${cleanCardmarketText}\n${removeNoise}\n${scrapeStructured}\n${compact}\n${buildQueries}\nthis.scrapeStructuredCardFields = scrapeStructuredCardFields; this.buildCardvaultQueries = buildCardvaultQueries;`, sandbox);

    const structured = sandbox.scrapeStructuredCardFields(
        'Camerupt (ASC 028)',
        { expansion: 'Ascended Heroes' }
    );

    assert.equal(structured.name, 'Camerupt');
    assert.equal(structured.searchName, 'Camerupt');
    assert.equal(structured.collectorNumber, '028');
    assert.equal(structured.expansion, 'Ascended Heroes');
    assert.deepEqual([...sandbox.buildCardvaultQueries(structured.name)], ['Camerupt']);
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
    assert.equal(fetchBodies[0].body.search_term, 'Camerupt');
    const extensionPayload = fetchBodies.find((entry) => entry.url.includes('/api/extension-card-search')).body;
    assert.equal(extensionPayload.name, 'Camerupt');
    assert.equal(extensionPayload.collectorNumber, '028');
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
    assert.equal(fetchCalls, 2, 'name resolution and structured search should run once each for duplicate requests');
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

    assert.deepEqual(sandbox.normalizeRequestClues(['card', 'carte', 'SWSH154', 'Evolving Skies']), ['SWSH154', 'Evolving Skies']);
    const title = sandbox.buildTitleWithRequestClues('Carta Pokemon Dragonite V', ['card', 'SWSH154']);
    assert.match(title, /Dragonite V/);
    assert.match(title, /SWSH154/);
    assert.doesNotMatch(title, /\b(?:carta|card|carte|cards)\b/i);
    assert.equal(
        sandbox.buildPrimaryClueSearchTitle('Carta Pokémon reshiram B/N ita', ['reshiram', 'Nita'], ['reshiram']),
        'reshiram'
    );
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
    for (const id of ['cardName', 'status', 'refreshBtn', 'frameSection', 'pokoinFrame', 'candidatesSection', 'candidateList']) {
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

test('CardTrader injected button intercepts click and opens side panel workflow', async () => {
    const source = readRepoFile('content.js');
    const contentStart = source.indexOf('function pokoinIconUrl');
    const functions = [
        'function setPokoinButtonLabel(button) { button.innerHTML = "Pokoin.com"; }',
        'function applyPokoinButtonStyles() {}',
        extractFunctionSource(source, 'extractCardTraderBlueprintId', contentStart),
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

test('content legacy gray buttons attach side-panel click before search results', async () => {
    const source = readRepoFile('content.js');
    const contentStart = source.indexOf('function pokoinIconUrl');
    const functions = [
        extractFunctionSource(source, 'extractCardTraderBlueprintId', contentStart),
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
