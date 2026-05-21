/**
 * EBAYE.js - eBay-specific processor
 * Contains logic for eBay product pages and listing feeds.
 */

class EbayProcessor {
    constructor() {
        this.isEnabled = true;
        this.processedPages = new Set();
        this.latestResultsByUrl = new Map();
        this.latestTitleByUrl = new Map();
        this.currentTitle = '';
        this.currentTitleElement = null;
        this.currentKeywords = [];
        this.selectedKeywordValues = new Set();
        this.currentPanel = null;
        this.currentPanelHost = null;
        this.currentButton = null;
        this.latestSearchToken = 0;
        this.currentSelectionRevision = 0;
        this.lastAppliedSearchSignature = '';
        this.searchResultsBySignature = new Map();
        this.pendingSearchApplications = new Map();
        this.lastRenderedPreviewResults = [];
        this.currentMatchCount = 0;
    }

    pokoinIconUrl() {
        return chrome.runtime.getURL('assets/pokoin-512.png');
    }

    setPokoinButtonLabel(button, matchCount = null) {
        const suffix = Number.isFinite(matchCount) ? ` (${matchCount})` : '';
        button.innerHTML = `
            <img data-pokoin-button-icon="true" src="${this.pokoinIconUrl()}" alt="" aria-hidden="true" style="width:20px;height:20px;min-width:20px;min-height:20px;max-width:20px;max-height:20px;flex:0 0 20px;border-radius:50%;object-fit:cover;display:block;">
            <span>Pokoin.com${suffix}</span>
        `;
        this.applyPokoinButtonStyles(button);
    }

    pokoinBlue() {
        return '#0ea5e9';
    }

    pokoinBlueHover() {
        return '#0284c7';
    }

    normalizeClueValue(value = '') {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[’`]/g, "'")
            .replace(/\bvastro\b/gi, 'vstar')
            .replace(/[^a-z0-9/'\s-]+/gi, (match) => match.includes('/') ? '/' : ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    compactClueValue(value = '') {
        return this.normalizeClueValue(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    ebayStopWords() {
        return new Set([
            'a', 'an', 'and', 'for', 'in', 'of', 'the', 'with',
            'pokemon', 'pokémon', 'pkkmn', 'pkn', 'pokn',
            'card', 'cards', 'carta', 'carte', 'tcg', 'trading',
            'near', 'mint', 'nm', 'lp', 'mp', 'hp', 'played', 'used',
            'full', 'art', 'holo', 'rare', 'ultra', 'secret', 'collection',
            'psa', 'bgs', 'cgc', 'sgc',
        ]);
    }

    addKeywordCandidate(candidates, value, source = 'text') {
        let label = this.normalizeClueValue(value)
            .replace(/\bex\b/gi, 'ex')
            .replace(/\bgx\b/gi, 'GX')
            .replace(/\bv\b/gi, 'V')
            .replace(/\bmega\b/gi, 'Mega')
            .replace(/\bvmax\b/gi, 'VMAX')
            .replace(/\bvstar\b/gi, 'VSTAR');
        if (/\bgenerations\b/i.test(label) && /\bradiant\s+collection\b/i.test(label)) {
            label = 'Generations Radiant Collection';
        } else {
            const aliasExpansion = this.knownExpansionAliases().find(({ pattern }) => pattern.test(label));
            if (aliasExpansion) {
                label = aliasExpansion.name;
            }
        }
        if (/\bsteam\b/i.test(label)) {
            label = 'Steam Siege';
        }
        const compact = this.compactClueValue(label);
        if (!label || (compact.length < 2 && !this.isVariationClue(label)) || this.ebayStopWords().has(label.toLowerCase()) || this.ebayStopWords().has(compact)) {
            return;
        }
        if (!candidates.some((candidate) => candidate.compact === compact)) {
            candidates.push({ label, value: label, compact, source });
        }
    }

    isVariationClue(value = '') {
        return /\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/i.test(this.normalizeClueValue(value));
    }

    isCollectorNumberClue(value = '') {
        const label = this.normalizeClueValue(value);
        if (/^(?:PSA|BGS|CGC|SGC)\s+\d{1,2}$/i.test(label)) {
            return false;
        }
        return /\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/i.test(label) ||
            /\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/i.test(label) ||
            /\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/.test(label) ||
            /\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/.test(label) ||
            /\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i.test(label);
    }

    isExpansionClue(value = '') {
        return this.knownExpansionAliases().some(({ pattern, name }) =>
            pattern.test(value) || this.compactClueValue(name) === this.compactClueValue(value)
        ) || /\b(?:team\s+magma\s+vs\s+aqua|ex\s+team\s+magma\s+vs\s+aqua)\b/i.test(this.normalizeClueValue(value));
    }

    isFeatureClue(value = '') {
        return /\b(?:illustration|full\s*-?\s*art|fullart|special illustration rare|illustration rare|secret rare|ultra rare|holo rare|holo|promo)\b/i.test(this.normalizeClueValue(value));
    }

    isPokemonNameLikeClue(value = '') {
        const label = this.removeEbayMarketplaceNoise(value);
        const compact = this.compactClueValue(label);
        if (!label || compact.length < 3 || /\d/.test(label) || this.isVariationClue(label)) {
            return false;
        }
        if (typeof window.extractTitleInfo !== 'function') {
            return false;
        }
        try {
            const titleInfo = window.extractTitleInfo(label) || {};
            const resolvedName = titleInfo.pokemonName || titleInfo.name || '';
            return Boolean(resolvedName && this.compactClueValue(resolvedName) === compact);
        } catch (error) {
            console.warn('⚠️ [EBAYE] Unable to validate eBay clue as Pokemon name:', error);
            return false;
        }
    }

    resolvedPokemonNameFromClue(value = '') {
        if (typeof window.extractTitleInfo !== 'function') {
            return '';
        }
        try {
            const titleInfo = window.extractTitleInfo(this.normalizeClueValue(value)) || {};
            const resolvedName = titleInfo.pokemonName || titleInfo.name || '';
            if (resolvedName) {
                return resolvedName;
            }
            const withoutVariation = this.normalizeClueValue(value)
                .replace(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            const fallbackInfo = withoutVariation ? window.extractTitleInfo(withoutVariation) || {} : {};
            return fallbackInfo.pokemonName || fallbackInfo.name || '';
        } catch (error) {
            console.warn('⚠️ [EBAYE] Unable to resolve eBay clue Pokemon name:', error);
            return '';
        }
    }

    removeEbayMarketplaceNoise(value = '') {
        return this.normalizeClueValue(value)
            .replace(/\b(?:pok[eé]mon|pokemon|pkkmn|pkn|pokn)\b/gi, ' ')
            .replace(/\b(?:carta|carte|card|cards|tcg|trading)\b/gi, ' ')
            .replace(/\b(?:sealed|seal(?:ed)?|pack|booster|lot|near mint|nm|mint|used)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    normalizeTargetedNameAlias(value = '') {
        const aliases = {
            magaerna: 'Magearna',
            magaeran: 'Magearna',
        };
        return aliases[this.compactClueValue(value)] || '';
    }

    knownExpansionAliases() {
        return [
            { pattern: /\bgenerations\s+radiant\s+collection\b/i, name: 'Generations Radiant Collection' },
            { pattern: /\bradiant\s+collection\b/i, name: 'Radiant Collection' },
            { pattern: /\bgenerations\b/i, name: 'Generations' },
            { pattern: /\bsteam\s*(?:siege|\.\.\.)?\b/i, name: 'Steam Siege' },
            { pattern: /\bfates\s+collide\b/i, name: 'Fates Collide' },
            { pattern: /\bbreakpoint\b/i, name: 'BREAKpoint' },
            { pattern: /\bbreakthrough\b/i, name: 'BREAKthrough' },
            { pattern: /\bevolutions\b|\bevoluzioni\b/i, name: 'Evolutions' },
            { pattern: /\bbase\s+set\b|\bset\s+base\b/i, name: 'Base Set' },
        ];
    }

    extractEbayDetails() {
        const selectors = [
            '[data-testid*="ux-labels-values"]',
            '.ux-labels-values',
            '.ux-layout-section__item',
            '.x-about-this-item',
            '.vim.x-about-this-item',
            '#viTabs_0_is',
        ];
        const text = selectors
            .flatMap((selector) => Array.from(document.querySelectorAll?.(selector) || []))
            .map((element) => element.textContent || '')
            .filter(Boolean)
            .join(' ');
        return this.normalizeClueValue(text).slice(0, 2000);
    }

    ebayCollectorNumberPatterns() {
        return [
            /\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/gi,
            /\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/g,
            /\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/gi,
            /\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/g,
            /\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/gi,
        ];
    }

    normalizeEbayCollectorNumber(value = '') {
        const normalized = this.normalizeClueValue(value)
            .replace(/\s*\/\s*/g, '/')
            .replace(/\s+/g, ' ')
            .trim();
        return normalized.match(/\b(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?\d{1,4}[a-z]?\s*\/\s*(?:(?:TG|GG|SL|RC|SH|SV|BW|XY|SM|SWSH|SVP)\s?)?\d{1,4}[a-z]?\b/i)?.[0]?.replace(/\s*\/\s*/g, '/').replace(/\s+/g, '') ||
            normalized.match(/\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/)?.[0]?.replace(/\s*\/\s*/g, '/').replace(/\s+/g, '') ||
            normalized.match(/\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/i)?.[0]?.replace(/\s+/g, ' ') ||
            normalized.match(/\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/)?.[0] ||
            normalized.match(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i)?.[0]?.replace(/\s*\/\s*/g, '/') ||
            normalized;
    }

    collectEbayCollectorClues(text = '') {
        const matches = [];
        this.ebayCollectorNumberPatterns().forEach((pattern) => {
            for (const match of String(text || '').matchAll(pattern)) {
                matches.push(this.normalizeEbayCollectorNumber(match[0]));
            }
        });
        const seen = new Set();
        return matches
            .filter((label) => {
                const compact = this.compactClueValue(label);
                if (!compact || seen.has(compact)) {
                    return false;
                }
                seen.add(compact);
                return true;
            })
            .sort((left, right) => this.compactClueValue(right).length - this.compactClueValue(left).length)
            .filter((label, index, all) => {
                const compact = this.compactClueValue(label);
                return !all.some((other, otherIndex) =>
                    otherIndex < index &&
                    this.compactClueValue(other).includes(compact) &&
                    !String(label || '').includes('/')
                );
            });
    }

    extractEbayKeywords(title = '', details = '', titleInfo = {}) {
        const sourceText = `${title} ${details}`.replace(/\s+/g, ' ').trim();
        if (!sourceText) {
            return [];
        }
        const candidates = [];
        const expansionHints = [
            'Generations Radiant Collection',
            'Radiant Collection',
            'Generations',
            'EX Team Magma vs Aqua',
            'Team Magma vs Aqua',
            'Steam',
            'Steam Siege',
            'Fates Collide',
            'BREAKpoint',
            'BREAKthrough',
            'Evolutions',
            'Base Set',
        ];
        expansionHints.forEach((hint) => {
            const pattern = new RegExp(`\\b${hint.replace(/\s+/g, '\\s+')}\\b`, 'i');
            if (pattern.test(sourceText)) {
                this.addKeywordCandidate(candidates, hint, pattern.test(title) ? 'title-expansion' : 'expansion');
            }
        });
        if (/\bRC\s*\d{1,4}[a-z]?(?:\s*\/\s*RC?\s*\d{1,4}[a-z]?)?\b/i.test(sourceText)) {
            this.addKeywordCandidate(
                candidates,
                /\bgenerations\b/i.test(sourceText) ? 'Generations Radiant Collection' : 'Radiant Collection',
                /\bRC\s*\d{1,4}/i.test(title) ? 'title-expansion' : 'expansion'
            );
        }
        this.knownExpansionAliases().forEach(({ pattern, name }) => {
            if (pattern.test(sourceText)) {
                this.addKeywordCandidate(candidates, name, pattern.test(title) ? 'title-expansion' : 'expansion');
            }
        });
        if ((titleInfo?.expansion || titleInfo?.expansionName) && new RegExp(`\\b${String(titleInfo.expansion || titleInfo.expansionName).replace(/\s+/g, '\\s+')}\\b`, 'i').test(sourceText)) {
            this.addKeywordCandidate(candidates, titleInfo.expansion || titleInfo.expansionName, 'title-expansion');
        }
        this.collectEbayCollectorClues(title).forEach((label) => this.addKeywordCandidate(candidates, label, 'title-pattern'));
        this.collectEbayCollectorClues(details).forEach((label) => this.addKeywordCandidate(candidates, label, 'pattern'));
        [
            /\b(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|reverse holo|holo|promo|rare)\b/gi,
            /\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi,
        ].forEach((pattern) => {
            for (const match of title.matchAll(pattern)) {
                this.addKeywordCandidate(candidates, match[0], 'title-pattern');
            }
            for (const match of details.matchAll(pattern)) {
                this.addKeywordCandidate(candidates, match[0], 'pattern');
            }
        });
        const normalized = sourceText
            .replace(/\bfull\s*-?\s*art\b|\bfullart\b/gi, ' ')
            .replace(/[()".,:;!?\\[\]{}|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const words = normalized
            .split(/\s+/)
            .map((word) => this.normalizeClueValue(word))
            .filter((word) => word && !this.ebayStopWords().has(word.toLowerCase()));
        const collectorCompacts = this.collectEbayCollectorClues(sourceText).map((label) => this.compactClueValue(label));
        const phraseOverlapsCollector = (phrase) => {
            const compactPhrase = this.compactClueValue(phrase);
            return collectorCompacts.some((collectorCompact) =>
                compactPhrase &&
                compactPhrase !== collectorCompact &&
                (collectorCompact.includes(compactPhrase) || compactPhrase.includes(collectorCompact))
            );
        };
        for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
            for (let index = 0; index <= words.length - size; index += 1) {
                const phrase = words.slice(index, index + size).join(' ');
                if (phrase.length >= 3 && !/^\d+$/.test(phrase) && !phraseOverlapsCollector(phrase)) {
                    this.addKeywordCandidate(candidates, phrase, 'text');
                }
            }
        }
        return this.prepareEbayKeywordCandidates(candidates, sourceText);
    }

    prepareEbayKeywordCandidates(candidates = [], sourceText = '') {
        const prepared = candidates.map((candidate, index) => {
            const label = candidate.label || candidate.value || '';
            const nameLike = this.isPokemonNameLikeClue(label);
            const collectorNumber = this.isCollectorNumberClue(label);
            const expansion = this.isExpansionClue(label);
            const feature = this.isFeatureClue(label);
            const variation = this.isVariationClue(label) && !expansion && !feature;
            const labelCompact = this.compactClueValue(label);
            const selectedByDefault =
                nameLike ||
                collectorNumber ||
                (variation && /^(?:title-pattern|title-expansion)$/.test(candidate.source || '')) ||
                (expansion && /^(?:title-expansion|title-pattern)$/.test(candidate.source || ''));
            return {
                ...candidate,
                nameLike,
                variation,
                collectorNumber,
                expansion,
                feature,
                selectedByDefault,
                category: nameLike ? 'name' : collectorNumber ? 'collector' : expansion ? 'expansion' : variation ? 'variation' : feature ? 'feature' : 'context',
                _index: index,
            };
        });
        const hasSelectedCollector = prepared.some((keyword) => keyword.collectorNumber && keyword.selectedByDefault);
        return prepared
            .map((keyword) => ({
                ...keyword,
                selectedByDefault: keyword.selectedByDefault || (hasSelectedCollector && keyword.nameLike),
            }))
            .sort((left, right) => {
                if (left.nameLike !== right.nameLike) return left.nameLike ? -1 : 1;
                if (left.selectedByDefault !== right.selectedByDefault) return left.selectedByDefault ? -1 : 1;
                if (left.collectorNumber !== right.collectorNumber) return left.collectorNumber ? -1 : 1;
                if (left.expansion !== right.expansion) return left.expansion ? -1 : 1;
                if (left.variation !== right.variation) return left.variation ? -1 : 1;
                return left._index - right._index;
            })
            .slice(0, 16)
            .map(({ _index, ...keyword }) => keyword);
    }

    numericCollectorNumber(value = '') {
        return this.normalizeClueValue(value).match(/\b(\d{1,4}[a-z]?)(?:\/\d{1,4}[a-z]?)?\b/i)?.[1] || '';
    }

    extractVariation(titleInfo = {}, text = '') {
        const variation = titleInfo.cardType ||
            (titleInfo.isEXCard ? 'ex' : '') ||
            (titleInfo.isGXCard ? 'gx' : '') ||
            (titleInfo.isVSTARCard ? 'vstar' : '') ||
            (titleInfo.isVCard ? 'v' : '') ||
            (text.match(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/i)?.[0] || '');
        return String(variation || '').replace(/\s+/g, '').replace(/\./g, '').toLowerCase();
    }

    extractExpansion(titleInfo = {}, text = '') {
        const explicitExpansion = titleInfo.expansion || titleInfo.expansionName || '';
        if (explicitExpansion) {
            return explicitExpansion;
        }
        if (/\bRC\s*\d{1,4}[a-z]?(?:\s*\/\s*RC?\s*\d{1,4}[a-z]?)?\b/i.test(text)) {
            return /\bgenerations\b/i.test(text) ? 'Generations Radiant Collection' : 'Radiant Collection';
        }
        return this.knownExpansionAliases().find(({ pattern }) => pattern.test(text))?.name || '';
    }

    extractCollectorNumber(titleInfo = {}, text = '') {
        return (
            text.match(/\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/i)?.[0] ||
            text.match(/\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/i)?.[0] ||
            text.match(/\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/i)?.[0] ||
            text.match(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/i)?.[0] ||
            titleInfo.collectorNumber ||
            titleInfo.cardNumber ||
            ''
        ).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
    }

    extractName(titleInfo = {}, title = '') {
        const titleName = titleInfo.pokemonName || titleInfo.name || titleInfo.trainerName || '';
        if (titleName) {
            return this.normalizeTargetedNameAlias(titleName) || titleName;
        }
        const withoutFeatureWords = String(title || '').replace(/\bfull\s*-?\s*art\b|\bfullart\b|\billustration\b/gi, ' ');
        const firstSegment = this.removeEbayMarketplaceNoise(withoutFeatureWords.split(/\s+-\s+/)[0] || withoutFeatureWords);
        const withoutCollectorExpansion = this.knownExpansionAliases().reduce((value, { pattern }) => value.replace(pattern, ' '), firstSegment)
            .replace(/\b[A-Z][A-Z0-9-]{0,7}\s?\d{1,4}[a-z]?\s*\/\s*(?:[A-Z][A-Z0-9-]{0,7}\s?)?\d{1,4}[a-z]?\b/g, ' ')
            .replace(/\b(?:BW|XY|SM|SWSH|SVP|SV-P)\s?-?\s?\d{1,4}[a-z]?\b/gi, ' ')
            .replace(/\b[A-Z0-9][A-Z0-9-]{1,7}\s+\d{1,4}[a-z]?\b/g, ' ')
            .replace(/\b\d{1,4}[a-z]?\s*\/\s*\d{1,4}[a-z]?\b/gi, ' ');
        const withoutVariation = firstSegment
            .replace(withoutCollectorExpansion !== firstSegment ? firstSegment : /^$/, withoutCollectorExpansion)
            .replace(/\b(?:vmax|vstar|ex|gx|v|lv\.?\s*x|mega|radiant|shining|prime|break)\b/gi, ' ')
            .replace(/\b(?:special illustration rare|illustration rare|secret rare|ultra rare|holo rare|holo|rare|near mint|nm|lp|mp|hp)\b/gi, ' ')
            .replace(/\b\d{2,3}\s*hp\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return this.normalizeTargetedNameAlias(withoutVariation) || withoutVariation;
    }

    buildEbayPayload(title = document.title, titleInfo = this.extractTitleInfo(title), details = this.extractEbayDetails()) {
        const keywords = this.extractEbayKeywords(title, details, titleInfo);
        const selectedKeywords = keywords.filter((keyword) => keyword.selectedByDefault);
        const selectedClues = selectedKeywords.map((keyword) => keyword.value);
        const nameKeyword = selectedKeywords.find((keyword) => keyword.nameLike);
        const collectorKeyword = selectedKeywords.find((keyword) => keyword.collectorNumber);
        const expansionKeyword = selectedKeywords.find((keyword) => keyword.expansion);
        const variationKeywords = selectedKeywords.filter((keyword) => keyword.variation);
        const featureKeywords = selectedKeywords.filter((keyword) => keyword.feature);
        const evidence = [title, details].filter(Boolean).join(' ');
        const fallbackName = this.extractName(titleInfo, title);
        const name = nameKeyword
            ? (this.resolvedPokemonNameFromClue(nameKeyword.value) || nameKeyword.value)
            : fallbackName;
        const variation = variationKeywords.map((keyword) => keyword.value).join(' ') || this.extractVariation(titleInfo, evidence);
        const collectorNumber = collectorKeyword ? this.normalizeEbayCollectorNumber(collectorKeyword.value) : (titleInfo.collectorNumber || titleInfo.cardNumber || this.extractCollectorNumber(titleInfo, evidence));
        const inferredExpansion = this.extractExpansion(titleInfo, evidence);
        const expansion = /^RC/i.test(collectorNumber) && /generations/i.test(evidence)
            ? 'Generations Radiant Collection'
            : (expansionKeyword?.value || inferredExpansion);
        const rarity = featureKeywords.find((keyword) => /illustration|full\s*-?\s*art|fullart/i.test(keyword.value))?.value ||
            (/\b(?:special illustration rare|illustration rare|illustration|full\s*-?\s*art|fullart)\b/i.test(evidence) ? 'illustration' : (titleInfo.rarity || ''));
        const features = [
            ...featureKeywords.map((keyword) => keyword.value),
            ...(rarity ? [rarity] : []),
        ].filter((feature, index, all) => all.findIndex((candidate) => this.compactClueValue(candidate) === this.compactClueValue(feature)) === index);
        const primaryClues = [
            [name, variation].filter(Boolean).join(' '),
            variation,
        ].filter(Boolean);
        const searchTitle = this.buildEbaySearchTitle(title, selectedClues, keywords, {
            name,
            variation,
            expansion,
            collectorNumber,
            features,
        });

        return {
            source: 'ebay',
            listingKey: this.stableUrl(),
            originalTitle: title,
            searchTitle: searchTitle || this.removeEbayMarketplaceNoise(title),
            primaryClues,
            selectedClues,
            selectedChipCategories: selectedClues.map((value) => ({
                label: value,
                value,
                category: selectedKeywords.find((keyword) => this.compactClueValue(keyword.value) === this.compactClueValue(value))?.category || 'context',
                selectedByDefault: true,
            })),
            name,
            variation,
            collectorNumber,
            numericCollectorNumber: collectorNumber ? this.numericCollectorNumber(collectorNumber) : '',
            expansion,
            features,
            rarity,
        };
    }

    buildEbaySearchTitle(title = this.currentTitle, clues = this.selectedKeywordLabels(), keywords = this.currentKeywords, fallback = {}) {
        const keywordForClue = (clue) => keywords.find((keyword) => this.compactClueValue(keyword.value) === this.compactClueValue(clue));
        const primaryClues = clues.filter((clue) => {
            const keyword = keywordForClue(clue);
            return keyword?.nameLike || keyword?.variation;
        });
        const selectedNameClues = primaryClues.filter((clue) => keywordForClue(clue)?.nameLike);
        const expansionClues = clues.filter((clue) => keywordForClue(clue)?.expansion);
        const collectorClues = clues.filter((clue) => keywordForClue(clue)?.collectorNumber);
        const featureClues = clues.filter((clue) => keywordForClue(clue)?.feature);
        const contextClues = clues.filter((clue) => {
            const keyword = keywordForClue(clue);
            return keyword && !keyword.nameLike && !keyword.variation && !keyword.expansion && !keyword.collectorNumber && !keyword.feature;
        });
        const compactExpansionClues = expansionClues.map((clue) => ({ clue, compact: this.compactClueValue(clue) }));
        const filteredExpansionClues = compactExpansionClues
            .filter(({ compact }, index, all) => !all.some((other, otherIndex) =>
                otherIndex !== index &&
                other.compact &&
                compact &&
                other.compact.includes(compact)
            ))
            .map(({ clue }) => clue);
        const effectiveExpansionClues = filteredExpansionClues.length > 0
            ? filteredExpansionClues
            : (fallback.expansion ? [fallback.expansion] : []);
        const effectiveFeatureClues = featureClues.length > 0
            ? featureClues
            : (fallback.features || []);
        const fallbackNameVariation = [fallback.name, fallback.variation].filter(Boolean).join(' ');
        const primaryWithoutFallbackDupes = primaryClues.filter((clue) => {
            const compactClue = this.compactClueValue(clue);
            const compactFallback = this.compactClueValue(fallbackNameVariation);
            return !(compactClue && compactFallback && compactFallback.endsWith(compactClue));
        });
        const selectedParts = clues.length > 0
            ? [
                ...(
                    selectedNameClues.length > 0
                        ? primaryClues
                        : [fallbackNameVariation, ...primaryWithoutFallbackDupes]
                ),
                ...effectiveExpansionClues,
                ...collectorClues,
                ...effectiveFeatureClues,
                ...contextClues,
            ]
            : [
                fallbackNameVariation,
                fallback.expansion,
                fallback.collectorNumber,
                ...(fallback.features || []),
            ];
        return selectedParts
            .map((part) => this.removeEbayMarketplaceNoise(part))
            .filter(Boolean)
            .filter((part, index, all) => {
                const compact = this.compactClueValue(part);
                return all.findIndex((candidate) => this.compactClueValue(candidate) === compact) === index &&
                    !all.some((candidate) => {
                        const candidateCompact = this.compactClueValue(candidate);
                        return candidateCompact !== compact &&
                            candidateCompact.includes(compact) &&
                            compact.length >= 4;
                    });
            })
            .join(' ') || this.removeEbayMarketplaceNoise(title);
    }

    selectedKeywordLabels() {
        return this.currentKeywords
            .filter((keyword) => this.selectedKeywordValues.has(keyword.compact))
            .map((keyword) => keyword.value);
    }

    selectedEbayKeywords() {
        return this.currentKeywords.filter((keyword) => this.selectedKeywordValues.has(keyword.compact));
    }

    selectedPrimaryClues(clues = this.selectedKeywordLabels()) {
        void clues;
        const selectedKeywords = this.selectedEbayKeywords();
        const nameKeyword = selectedKeywords.find((keyword) => keyword.nameLike);
        const variationKeywords = selectedKeywords.filter((keyword) => keyword.variation);
        const titleInfo = this.extractTitleInfo(this.currentTitle || '');
        const resolvedName = nameKeyword
            ? (this.resolvedPokemonNameFromClue(nameKeyword.value) || nameKeyword.value)
            : '';
        const name = resolvedName || this.extractName(titleInfo, this.currentTitle || '');
        const variation = variationKeywords.map((keyword) => keyword.value).join(' ') || this.extractVariation(titleInfo, this.currentTitle || '');
        const combinedName = this.compactClueValue(name).endsWith(this.compactClueValue(variation))
            ? name
            : [name, variation].filter(Boolean).join(' ');
        return [
            combinedName,
            variation,
        ].filter(Boolean).filter((clue, index, all) =>
            all.findIndex((candidate) => this.compactClueValue(candidate) === this.compactClueValue(clue)) === index
        );
    }

    buildSelectedEbayPayload(title = this.currentTitle, details = this.extractEbayDetails()) {
        const titleInfo = this.extractTitleInfo(title);
        const selectedClues = this.selectedKeywordLabels();
        const selectedKeywords = this.selectedEbayKeywords();
        const nameKeyword = selectedKeywords.find((keyword) => keyword.nameLike);
        const collectorKeyword = selectedKeywords.find((keyword) => keyword.collectorNumber);
        const expansionKeyword = selectedKeywords.find((keyword) => keyword.expansion);
        const variationKeywords = selectedKeywords.filter((keyword) => keyword.variation);
        const featureKeywords = selectedKeywords.filter((keyword) => keyword.feature);
        const evidence = [title, details].filter(Boolean).join(' ');
        const name = nameKeyword
            ? (this.resolvedPokemonNameFromClue(nameKeyword.value) || nameKeyword.value)
            : this.extractName(titleInfo, title);
        const variation = variationKeywords.map((keyword) => keyword.value).join(' ') || this.extractVariation(titleInfo, evidence);
        const collectorNumber = collectorKeyword ? this.normalizeEbayCollectorNumber(collectorKeyword.value) : (titleInfo.collectorNumber || titleInfo.cardNumber || this.extractCollectorNumber(titleInfo, evidence));
        const inferredExpansion = this.extractExpansion(titleInfo, evidence);
        const expansion = /^RC/i.test(collectorNumber) && /generations/i.test(evidence)
            ? 'Generations Radiant Collection'
            : (expansionKeyword?.value || inferredExpansion);
        const features = featureKeywords.map((keyword) => keyword.value);
        const fallback = {
            name,
            variation: variation || this.extractVariation(titleInfo, evidence),
            expansion: expansion || this.extractExpansion(titleInfo, evidence),
            collectorNumber: collectorNumber || this.extractCollectorNumber(titleInfo, evidence),
            features,
        };
        return {
            source: 'ebay',
            listingKey: this.stableUrl(),
            originalTitle: title,
            searchTitle: this.buildEbaySearchTitle(title, selectedClues, this.currentKeywords, fallback),
            primaryClues: this.selectedPrimaryClues(selectedClues),
            selectedClues,
            selectedChipCategories: selectedKeywords.map((keyword) => ({
                label: keyword.label,
                value: keyword.value,
                category: keyword.category,
                selectedByDefault: Boolean(keyword.selectedByDefault),
            })),
            name,
            variation,
            collectorNumber,
            numericCollectorNumber: collectorNumber ? this.numericCollectorNumber(collectorNumber) : '',
            expansion,
            features,
            rarity: featureKeywords.some((keyword) => /illustration|full\s*-?\s*art|fullart/i.test(keyword.value)) ? 'illustration' : '',
        };
    }

    buildEbaySearchSignature(payload = {}) {
        return [
            'ebay',
            this.stableUrl(payload.listingKey || window.location.href),
            this.compactClueValue(payload.searchTitle || ''),
            ...(payload.selectedClues || []).map((clue) => this.compactClueValue(clue)).sort(),
            ...(payload.primaryClues || []).map((clue) => this.compactClueValue(clue)).sort(),
        ].join('|');
    }

    isHighConfidenceMatch(result = {}) {
        const rawScore = result.search_score ?? result.relevanceScore ?? result.score ?? result.search_rank;
        const score = Number(rawScore);
        if (!Number.isFinite(score)) return false;
        if (score <= 1) return score >= 0.7;
        if (score <= 100) return score >= 70;
        return true;
    }

    countHighConfidenceMatches(results = []) {
        return results.filter((result) => this.isHighConfidenceMatch(result)).length;
    }

    async searchCardWithBackground(title, ebayPayload = this.buildEbayPayload(title)) {
        const response = await chrome.runtime.sendMessage({
            action: 'searchCardForTitle',
            title: ebayPayload.searchTitle || title,
            originalTitle: title,
            clues: ebayPayload.selectedClues || [],
            primaryClues: ebayPayload.primaryClues || [],
            selectedClues: ebayPayload.selectedClues || [],
            ebayPayload,
            marketplacePayload: ebayPayload,
            previewSignature: this.buildEbaySearchSignature(ebayPayload),
            selectionRevision: this.currentSelectionRevision,
            url: window.location.href,
        });
        const results = response?.success && Array.isArray(response.results) ? response.results : [];
        this.storeMatchedResults(window.location.href, title, results);
        return results;
    }

    stableUrl(url = window.location.href) {
        try {
            const parsed = new URL(url);
            parsed.hash = '';
            parsed.search = '';
            return parsed.href.replace(/\/+$/, '');
        } catch (error) {
            return String(url || '').split('#')[0].split('?')[0].replace(/\/+$/, '');
        }
    }

    candidateCardId(result = {}) {
        return result.card_id || result.blueprint_id || result.cardId || result.blueprintId || '';
    }

    storeMatchedResults(url = window.location.href, title = '', results = []) {
        const key = this.stableUrl(url);
        this.latestTitleByUrl.set(key, title || document.title || '');
        this.latestResultsByUrl.set(key, Array.isArray(results) ? results : []);
    }

    buildSidePanelPreviewRowsPayload(url = window.location.href, results = this.latestResultsByUrl.get(this.stableUrl(url)) || []) {
        const rows = (Array.isArray(results) ? results : [])
            .slice(0, 8)
            .map((result) => {
                const cardId = this.candidateCardId(result);
                if (!cardId) {
                    return null;
                }
                return {
                    card_id: String(cardId),
                    name: result.name || result.name_en || result.pokemon_name || '',
                    set_name: result.set_name || result.expansion_name_en || result.expansionName || result.expansion_name || '',
                    card_number: result.card_number || result.collector_number || result.collectorNumber || '',
                    expansion_symbol_url: result.expansion_symbol_url || result.expansionSymbolUrl || result.symbolImageUrl || '',
                    source: result.source || 'ebay_overlay_preview',
                    search_rank: result.search_rank || result.searchScore || result.search_score || result.relevanceScore || result.score || '',
                    pokoin_price: result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '',
                };
            })
            .filter(Boolean);
        return rows.length > 0 ? { previewRows: rows } : {};
    }

    buildSidePanelCandidatePayload(result = {}) {
        const cardId = this.candidateCardId(result);
        if (!cardId) {
            return {};
        }
        return {
            selectedCandidateId: String(cardId),
            selectedCandidate: {
                card_id: String(cardId),
                name: result.name || result.name_en || result.pokemon_name || '',
                set_name: result.set_name || result.expansion_name_en || result.expansionName || result.expansion_name || '',
                card_number: result.card_number || result.collector_number || result.collectorNumber || '',
                expansion_symbol_url: result.expansion_symbol_url || result.expansionSymbolUrl || result.symbolImageUrl || '',
                source: result.source || 'ebay_overlay',
                search_rank: result.search_rank || result.searchScore || result.search_score || result.relevanceScore || result.score || '',
                pokoin_price: result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '',
            },
        };
    }

    currentPreviewResults(options = {}) {
        const payload = this.buildSelectedEbayPayload(this.currentTitle || document.title);
        const signature = this.buildEbaySearchSignature(payload);
        const results = this.searchResultsBySignature.get(signature) ||
            this.pendingSearchApplications.get(signature) ||
            (
                options.allowRenderedFallback || signature === this.lastAppliedSearchSignature
                    ? this.lastRenderedPreviewResults
                    : []
            ) ||
            [];
        return Array.isArray(results) ? results : [];
    }

    openPokoinSidePanel(url = window.location.href, title = document.title, ebayPayload = this.buildEbayPayload(title), candidate = null) {
        const stableUrl = this.stableUrl(url);
        const hasSelectedOverlayState = this.currentKeywords.length > 0 &&
            this.selectedKeywordValues.size > 0 &&
            this.compactClueValue(title || '') === this.compactClueValue(this.currentTitle || '');
        const payload = hasSelectedOverlayState ? ebayPayload : this.buildEbayPayload(title);
        const previewResults = candidate
            ? this.currentPreviewResults({ allowRenderedFallback: true })
            : this.currentPreviewResults();
        const previewPayload = this.buildSidePanelPreviewRowsPayload(
            url,
            previewResults.length ? previewResults : (this.latestResultsByUrl.get(stableUrl) || [])
        );
        if (!previewPayload.previewRows?.length && candidate) {
            previewPayload.previewRows = [this.buildSidePanelCandidatePayload(candidate).selectedCandidate].filter(Boolean);
        }
        return chrome.runtime.sendMessage({
            action: 'openSidePanelForCurrentTab',
            url,
            title: payload.searchTitle || this.latestTitleByUrl.get(stableUrl) || title,
            originalTitle: title,
            clues: payload.selectedClues || [],
            primaryClues: payload.primaryClues || [],
            selectedClues: payload.selectedClues || [],
            ebayPayload: payload,
            marketplacePayload: payload,
            previewSignature: this.buildEbaySearchSignature(payload),
            previewSource: this.currentButton ? 'ebay_overlay' : 'ebay_button_preview',
            selectionRevision: this.currentSelectionRevision,
            ...previewPayload,
            ...this.buildSidePanelCandidatePayload(candidate || {}),
        }).catch((error) => {
            console.warn('⚠️ [EBAYE] Unable to open side panel:', error);
        });
    }

    attachSidePanelClick(button, title = document.title, url = window.location.href, ebayPayload = this.buildEbayPayload(title)) {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            this.openPokoinSidePanel(url, title, ebayPayload);
        });
    }

    applyPokoinButtonStyles(button, styles = {}) {
        Object.assign(button.style, {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: this.pokoinBlue(),
            color: 'white',
            border: 'none',
            borderRadius: '999px',
            cursor: 'pointer',
            fontWeight: '700',
            transition: 'all 0.2s ease',
            width: 'auto',
            maxWidth: 'max-content',
            minWidth: '0',
            minHeight: '0',
            lineHeight: '1.2',
            boxSizing: 'border-box',
            flex: '0 0 auto',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            ...styles,
        });
        const icon = button.querySelector('img');
        if (icon) {
            icon.setAttribute?.('data-pokoin-button-icon', 'true');
            Object.assign(icon.style, {
                width: '20px',
                height: '20px',
                minWidth: '20px',
                minHeight: '20px',
                maxWidth: '20px',
                maxHeight: '20px',
                flex: '0 0 20px',
                borderRadius: '50%',
                objectFit: 'cover',
                display: 'block',
            });
        }
    }

    ebayPanelRoot(panel = this.currentPanel) {
        return panel?.shadowRoot || panel;
    }

    removeOwnedPanelChildren(selector) {
        this.ebayPanelRoot()?.querySelectorAll?.(selector).forEach((element) => element.remove());
    }

    createEbayOwnedPanelHost() {
        const host = document.createElement('div');
        host.setAttribute('data-pokoin-extension-panel', 'ebay');
        host.setAttribute('data-pokoin-ebay-panel-host', 'true');
        Object.assign(host.style, {
            position: 'fixed',
            left: '16px',
            bottom: '18px',
            zIndex: '2147483646',
            width: 'min(340px, calc(100vw - 32px))',
            pointerEvents: 'none',
        });
        let root = host;
        if (typeof host.attachShadow === 'function') {
            root = host.attachShadow({ mode: 'open' });
            const style = document.createElement('style');
            style.textContent = ':host{all:initial} button{font-family:Arial,sans-serif}';
            root.appendChild(style);
        }
        const panel = document.createElement('div');
        panel.setAttribute('data-pokoin-ebay-panel', 'true');
        Object.assign(panel.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            pointerEvents: 'auto',
            fontFamily: 'Arial, sans-serif',
        });
        root.appendChild(panel);
        return { host, panel };
    }

    findExistingEbayPanelHost() {
        return document.querySelector?.('[data-pokoin-ebay-panel-host]') || document.body?.querySelector?.('[data-pokoin-ebay-panel-host]') || null;
    }

    findExistingEbayPanel(host = this.currentPanelHost) {
        if (!host) {
            return null;
        }
        return host.shadowRoot?.querySelector?.('[data-pokoin-ebay-panel]') || host.querySelector?.('[data-pokoin-ebay-panel]');
    }

    ensureEbayPanel() {
        let host = this.currentPanelHost;
        let panel = this.findExistingEbayPanel(host);
        if (!host || !panel) {
            host = this.findExistingEbayPanelHost();
            panel = this.findExistingEbayPanel(host);
        }
        if (!host || !panel) {
            ({ host, panel } = this.createEbayOwnedPanelHost());
        }
        this.currentPanelHost = host;
        this.currentPanel = panel;
        if (!host.parentNode || !document.contains(host)) {
            document.body?.appendChild(host);
        }
        return panel;
    }

    isEbayOwnedNodeConnected(node) {
        if (!node) {
            return false;
        }
        return document.contains(node) ||
            Boolean(this.currentPanelHost && document.contains(this.currentPanelHost) && this.currentPanelHost.contains?.(node)) ||
            Boolean(this.currentPanelHost && document.contains(this.currentPanelHost) && this.currentPanel?.contains?.(node));
    }

    createEbayPanelButton() {
        const panel = this.ensureEbayPanel();
        this.removeOwnedPanelChildren('[data-pokemon-linker-button]');
        const button = document.createElement('button');
        button.setAttribute('data-pokemon-linker-button', 'true');
        button.setAttribute('data-pokoin-ebay-primary-button', 'true');
        this.setPokoinButtonLabel(button, this.currentMatchCount);
        button.style.cssText = `
            width: 100%;
            padding: 10px 14px;
            font-size: 14px;
            font-family: Arial, sans-serif;
            box-shadow: 0 4px 12px rgba(2, 132, 199, 0.18);
        `;
        this.applyPokoinButtonStyles(button, {
            borderRadius: '10px',
            background: '#075985',
            border: '1px solid rgba(56, 189, 248, 0.35)',
        });
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            this.openPokoinSidePanel(window.location.href, this.currentTitle || document.title, this.buildSelectedEbayPayload(this.currentTitle || document.title));
        }, true);
        panel.prepend?.(button) || panel.appendChild(button);
        this.currentButton = button;
        return button;
    }

    prepareEbayKeywords(title, details) {
        this.currentKeywords = this.extractEbayKeywords(title, details, this.extractTitleInfo(title));
        this.selectedKeywordValues = new Set(
            this.currentKeywords
                .filter((keyword) => keyword.selectedByDefault)
                .map((keyword) => keyword.compact)
        );
    }

    applyKeywordChipStyle(chip, selected) {
        Object.assign(chip.style, {
            border: selected ? '1px solid #38bdf8' : '1px solid rgba(148, 163, 184, 0.45)',
            borderRadius: '999px',
            padding: '5px 9px',
            background: selected ? 'rgba(14, 165, 233, 0.92)' : 'rgba(15, 23, 42, 0.68)',
            color: '#ffffff',
            fontSize: '12px',
            lineHeight: '1',
            cursor: 'pointer',
            fontWeight: selected ? '700' : '500',
        });
        chip.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }

    renderKeywordToggles(title, details) {
        this.removeOwnedPanelChildren('[data-pokoin-ebay-keywords]');
        if (!this.currentKeywords.length) {
            this.prepareEbayKeywords(title, details);
        }
        const container = document.createElement('div');
        container.setAttribute('data-pokoin-ebay-keywords', 'true');
        container.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 8px;
            border-radius: 12px;
            background: rgba(15, 23, 42, 0.86);
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.22);
            font-family: Arial, sans-serif;
        `;
        this.currentKeywords.forEach((keyword) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.textContent = keyword.label;
            chip.setAttribute('data-pokoin-ebay-keyword', keyword.compact);
            chip.setAttribute('data-pokoin-ebay-keyword-category', keyword.category);
            this.applyKeywordChipStyle(chip, this.selectedKeywordValues.has(keyword.compact));
            chip.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const isSelected = this.selectedKeywordValues.has(keyword.compact);
                if (isSelected) {
                    this.selectedKeywordValues.delete(keyword.compact);
                } else {
                    this.selectedKeywordValues.add(keyword.compact);
                }
                this.applyKeywordChipStyle(chip, !isSelected);
                this.invalidateEbayPreviewForSelectionChange();
                this.runEbaySearch(this.currentTitle, 'keyword-toggle');
            }, true);
            container.appendChild(chip);
        });
        this.ensureEbayPanel().appendChild(container);
    }

    compactCandidateMeta(result = {}) {
        const rawNumber = String(result.collector_number || result.card_number || result.collectorNumber || '').trim();
        const number = rawNumber.match(/\b(?:[A-Z]{1,6}\s?)?(\d{1,4}[a-z]?)(?:\s*\/\s*(?:[A-Z]{1,6}\s?)?\d{1,4}[a-z]?)?\b/i)?.[1] || '';
        const setName = result.expansion_name_en || result.expansionName || result.set_name || result.setName || '';
        const price = result.pokoin_price || result.pokoinPrice || result.price_formatted || result.priceFormatted || '';
        return [number || rawNumber, setName, price].filter(Boolean).join(' · ');
    }

    renderCandidatePreview(results = []) {
        this.removeOwnedPanelChildren('[data-pokoin-candidate-preview]');
        this.lastRenderedPreviewResults = Array.isArray(results) ? results : [];
        this.currentMatchCount = Array.isArray(results) ? results.slice(0, 8).length : 0;
        if (this.currentButton) {
            this.setPokoinButtonLabel(this.currentButton, this.currentMatchCount);
        }
        if (!this.isEbayOwnedNodeConnected(this.currentButton) || results.length === 0) {
            return;
        }
        const preview = document.createElement('div');
        preview.setAttribute('data-pokoin-candidate-preview', 'true');
        preview.style.cssText = `
            width: 100%;
            max-height: calc(100vh - 220px);
            overflow-y: auto;
            padding: 12px;
            border: 1px solid rgba(56, 189, 248, 0.35);
            border-radius: 16px;
            background: rgba(7, 17, 31, 0.94);
            color: #f8fafc;
            box-shadow: 0 18px 42px rgba(2, 6, 23, 0.35);
            font-family: Arial, sans-serif;
        `;
        results.slice(0, 8).forEach((result) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.setAttribute('data-pokoin-candidate-row', 'true');
            row.setAttribute('aria-label', `Open ${this.compactCandidateMeta(result) || 'candidate'} in Pokoin side panel`);
            row.style.cssText = `
                display: grid;
                width: 100%;
                padding: 10px 0;
                border: 0;
                border-top: 1px solid rgba(148, 163, 184, 0.18);
                background: transparent;
                color: inherit;
                text-align: left;
                cursor: pointer;
                pointer-events: auto;
            `;
            row.innerHTML = `<span style="display:block;color:#f8fafc;font-size:13px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.compactCandidateMeta(result) || 'Candidate'}</span>`;
            row.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation?.();
                this.openPokoinSidePanel(window.location.href, this.currentTitle || document.title, this.buildSelectedEbayPayload(this.currentTitle || document.title), result);
            }, true);
            preview.appendChild(row);
        });
        this.ensureEbayPanel().appendChild(preview);
    }

    invalidateEbayPreviewForSelectionChange() {
        this.currentSelectionRevision += 1;
        this.latestSearchToken += 1;
        this.lastAppliedSearchSignature = '';
        this.pendingSearchApplications.clear();
        this.lastRenderedPreviewResults = [];
        this.removeOwnedPanelChildren('[data-pokoin-candidate-preview]');
        this.currentMatchCount = 0;
        if (this.currentButton) {
            this.setPokoinButtonLabel(this.currentButton, this.currentMatchCount);
        }
    }

    async runEbaySearch(title = this.currentTitle, trigger = 'process') {
        const ebayPayload = this.buildSelectedEbayPayload(title);
        const searchSignature = this.buildEbaySearchSignature(ebayPayload);
        if (searchSignature === this.lastAppliedSearchSignature && this.searchResultsBySignature.has(searchSignature)) {
            this.applyEbaySearchResults(searchSignature, this.searchResultsBySignature.get(searchSignature), { trigger });
            return;
        }
        const searchToken = ++this.latestSearchToken;
        const backgroundResults = await this.searchCardWithBackground(title, ebayPayload);
        if (searchToken !== this.latestSearchToken || searchSignature !== this.buildEbaySearchSignature(this.buildSelectedEbayPayload(title))) {
            console.log('🚫 [EBAYE] Ignored stale eBay overlay search response');
            return;
        }
        this.applyEbaySearchResults(searchSignature, backgroundResults, { trigger });
    }

    applyEbaySearchResults(searchSignature, results = []) {
        if (!this.isEbayOwnedNodeConnected(this.currentButton)) {
            this.lastAppliedSearchSignature = searchSignature;
            this.searchResultsBySignature.set(searchSignature, results);
            this.renderCandidatePreview(results);
            return false;
        }
        this.lastAppliedSearchSignature = searchSignature;
        this.pendingSearchApplications.delete(searchSignature);
        this.searchResultsBySignature.set(searchSignature, results);
        this.renderCandidatePreview(results);
        return true;
    }

    /**
     * Initialize eBay processor
     */
    init() {
        console.log('🔴 [EBAYE] Initializing eBay processor...');
        
        // Process immediately if current page is a product page
        if (this.isProductPage()) {
            this.processProductPage();
        }
        
        // Start observer for new listings
        this.startObserver();
    }

    /**
     * Check whether current page is an eBay product page
     */
    isProductPage() {
        return window.location.hostname.includes('ebay') && 
               (window.location.pathname.includes('/itm/') || 
                document.querySelector('h1.x-item-title__mainTitle'));
    }

    /**
     * Process an eBay product page
     */
    processProductPage() {
        const pageKey = this.stableUrl(window.location.href);
        if (this.processedPages.has(pageKey) && this.isEbayOwnedNodeConnected(this.currentButton)) {
            console.log('🚫 [EBAYE] Product page already processed, skipping');
            return;
        }

        try {
            console.log('🔍 [EBAYE] Processing eBay product page...');
            
            // Find product title
            const titleSelectors = [
                'h1.x-item-title__mainTitle',
                'h1[data-testid="x-item-title__mainTitle"]',
                'h1.x-item-title__titleText',
                '[data-testid="x-item-title"] h1',
                'h1[class*="title"]',
                'h1'
            ];
            
            let titleElement = null;
            for (const selector of titleSelectors) {
                titleElement = document.querySelector(selector);
                if (titleElement) break;
            }
            
            if (!titleElement) {
                console.log('⚠️ [EBAYE] Product title not found');
                return;
            }
            
            const title = titleElement.textContent.trim();
            if (!title) {
                console.log('⚠️ [EBAYE] Product title is empty');
                return;
            }
            
            console.log(`🔍 [EBAYE] Product title: "${title}"`);

            const details = this.extractEbayDetails();
            this.currentTitle = title;
            this.currentTitleElement = titleElement;
            this.prepareEbayKeywords(title, details);
            this.createEbayPanelButton();
            this.renderKeywordToggles(title, details);
            this.runEbaySearch(title, 'product-page');
            
            // Mark page as processed
            this.processedPages.add(pageKey);
            
        } catch (error) {
            console.error('❌ [EBAYE] Error while processing product page:', error);
        }
    }

    /**
     * Start observer for new listings
     */
    startObserver() {
        const observer = new MutationObserver((mutations) => {
            if (!this.isEnabled) return;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.processNewListings(node);
                        }
                    });
                }
            });
        });
        
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            console.log('✅ [EBAYE] Observer started');
        }
    }

    /**
     * Process new listings
     */
    processNewListings(container) {
        const listings = this.findListings(container);
        listings.forEach(listing => {
            if (!listing.hasAttribute('data-pokemon-linker-processed')) {
                this.processListing(listing);
            }
        });
    }

    /**
     * Find listings in a container
     */
    findListings(container) {
        const selectors = [
            '.s-item',
            '.s-item__wrapper',
            '.s-item__info',
            '.s-item__details'
        ];
        
        const listings = [];
        selectors.forEach(selector => {
            const elements = container.querySelectorAll ? 
                container.querySelectorAll(selector) : 
                (container.matches && container.matches(selector) ? [container] : []);
            listings.push(...elements);
        });
        
        return listings;
    }

    /**
     * Process one listing
     */
    async processListing(listingElement) {
        if (!this.isEnabled || listingElement.hasAttribute('data-pokemon-linker-processed')) {
            return;
        }

        try {
            const title = this.extractTitleFromListing(listingElement);
            if (!title) return;
            
            const titleInfo = this.extractTitleInfo(title);
            const ebayPayload = this.buildEbayPayload(title, titleInfo);
            
            // Create button
            const button = document.createElement('button');
            button.setAttribute('data-pokemon-linker-button', 'true');
            this.setPokoinButtonLabel(button);
            button.style.cssText = `
                margin-top: 8px;
                margin-left: 8px;
                padding: 6px 12px;
                font-size: 14px;
            `;
            this.applyPokoinButtonStyles(button);
            const listingUrl = listingElement.querySelector?.('a[href*="/itm/"]')?.href || window.location.href;
            this.attachSidePanelClick(button, title, listingUrl, { ...ebayPayload, listingKey: this.stableUrl(listingUrl) });
            
            // Insert button
            const inserted = this.insertLinkContainer(listingElement, button);
            if (inserted) {
                console.log(`✅ [EBAYE] Added button for ${titleInfo.pokemonName || title}`);
                
                // Search database
                const results = await this.searchCardInDatabase(titleInfo, title, ebayPayload);
                this.storeMatchedResults(listingUrl, title, results);
                if (results && results.length > 0) {
                    this.setPokoinButtonLabel(button, this.countHighConfidenceMatches(results));
                }
            }
            
            listingElement.setAttribute('data-pokemon-linker-processed', 'true');
            
        } catch (error) {
            console.error('❌ [EBAYE] Error while processing listing:', error);
        }
    }

    /**
     * Extract title from listing
     */
    extractTitleFromListing(listingElement) {
        const titleSelectors = [
            '.s-item__title',
            '.s-item__link',
            'h3',
            '.title',
            '.name'
        ];
        
        for (const selector of titleSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.textContent && element.textContent.trim()) {
                let title = element.textContent.trim();
                title = title.replace(/\b(CardTrader|Pokoin)\b/g, '').trim();
                return title;
            }
        }
        
        return null;
    }

    /**
     * Insert link container
     */
    insertLinkContainer(listingElement, button) {
        const insertAfterSelectors = [
            '.s-item__title',
            '.s-item__link',
            'h3'
        ];
        
        for (const selector of insertAfterSelectors) {
            const element = listingElement.querySelector(selector);
            if (element && element.parentNode) {
                const parent = element.parentNode;
                parent.insertBefore(button, element.nextSibling);
                return true;
            }
        }
        
        if (listingElement.parentNode) {
            listingElement.parentNode.insertBefore(button, listingElement.nextSibling);
            return true;
        }
        return false;
    }

    /**
     * Extract title info (delegates to `content.js`)
     */
    extractTitleInfo(title) {
        // Delegate to global function when available
        if (typeof window.extractTitleInfo === 'function') {
            return window.extractTitleInfo(title);
        }
        return { pokemonName: null };
    }

    /**
     * Search database through the background service worker.
     */
    async searchCardInDatabase(titleInfo, title, ebayPayload = this.buildEbayPayload(title, titleInfo)) {
        void titleInfo;
        return this.searchCardWithBackground(title, ebayPayload);
    }

    /**
     * Generate Pokoin card link
     */
    generatePokoinLink(blueprintId) {
        return `https://pokoin.com/marketplace/en/cards/${blueprintId}`;
    }
}

// Export for global usage
window.EbayProcessor = EbayProcessor; 