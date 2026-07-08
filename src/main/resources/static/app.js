const instantButton = document.querySelector('#instantButton');
const cacheButton = document.querySelector('#cacheButton');
const compactButton = document.querySelector('#compactButton');
const cavemanButton = document.querySelector('#cavemanButton');
const instantResult = document.querySelector('#instantResult');
const cacheResult = document.querySelector('#cacheResult');
const compactResult = document.querySelector('#compactResult');
const cavemanResult = document.querySelector('#cavemanResult');

const formatPercent = (value) => `${Number(value).toFixed(2)}%`;
const formatInteger = (value) => new Intl.NumberFormat().format(Number(value ?? 0));
const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

// Money small enough to be a fraction of a cent needs more precision than a
// rounded-up projection of the same call run thousands of times.
const formatMoney = (value, currencyCode) => {
    const amount = Number(value) || 0;
    let decimals = 2;
    if (amount > 0 && amount < 0.0001) {
        decimals = 8;
    } else if (amount > 0 && amount < 0.01) {
        decimals = 6;
    } else if (amount > 0 && amount < 1) {
        decimals = 4;
    }
    return `${currencyCode} ${amount.toFixed(decimals)}`;
};

const formatRate = (value, currencyCode) => {
    const amount = Number(value) || 0;
    const decimals = amount > 0 && amount < 1 ? 3 : 2;
    return `${currencyCode} ${amount.toFixed(decimals)}`;
};

// Compact unit price for a single token type, e.g. "USD 30 / 1M". Color, not
// this label, carries the "how expensive" signal; the number keeps it literal.
const formatPerMillion = (ratePerMillion, currencyCode) => {
    const amount = Number(ratePerMillion) || 0;
    let decimals = 2;
    if (amount > 0 && amount < 0.1) {
        decimals = 3;
    } else if (amount % 1 === 0) {
        decimals = 0;
    }
    return `${currencyCode} ${amount.toFixed(decimals)} / 1M`;
};

// One segment of the dual count/cost bar. Width is the share; the tier class
// (cheap | mid | hot) maps the token type to its price-intensity color so the
// same token reads identically in the count bar and the cost bar.
const tokenSegment = (tier, label, widthPercent) => {
    const width = Math.max(0, Number(widthPercent) || 0);
    if (width <= 0) {
        return '';
    }
    return `<div class="tok-seg tok-${tier}" style="width: ${width}%" data-label="${escapeHtml(label)}"><span>${label}</span></div>`;
};

const formatClock = (iso) => {
    const when = new Date(iso);
    return Number.isNaN(when.getTime()) ? String(iso ?? '') : when.toLocaleTimeString();
};

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    if (!response.ok) {
        throw new Error(json.message || json.error || `Request failed with ${response.status}`);
    }
    return json;
}

function renderInstant(data) {
    const pricing = data.pricing;
    const cost = data.cost;
    const usage = data.usage;
    const cache = data.cache;
    const currency = pricing.currencyCode || cost.currencyCode;

    const totalCost = Number(cost.total) || 0;
    const standardInputCost = Number(cost.standardInput) || 0;
    const cachedInputCost = Number(cost.cachedInput) || 0;
    const inputCost = standardInputCost + cachedInputCost;
    const outputCost = Number(cost.output) || 0;
    const costBasis = standardInputCost + cachedInputCost + outputCost;

    const standardInputTokens = Number(cache.standardInputTokens) || 0;
    const cachedInputTokens = Number(cache.cachedInputTokens) || 0;
    const outputTokens = Number(usage.outputTokens) || 0;
    const tokenBasis = standardInputTokens + cachedInputTokens + outputTokens;

    // Two aligned bars share the same heat colors: the top bar weights each
    // token type by COUNT, the bottom by COST. Output is the hot color, so its
    // thin count slice but fat cost slice makes "60x pricier per token" visible.
    const pct = (part, whole) => (whole > 0 ? (Number(part) / whole) * 100 : 0);
    const countBar = [
        tokenSegment('cheap', `${formatInteger(cachedInputTokens)} cached`, pct(cachedInputTokens, tokenBasis)),
        tokenSegment('mid', `${formatInteger(standardInputTokens)} input`, pct(standardInputTokens, tokenBasis)),
        tokenSegment('hot', `${formatInteger(outputTokens)} output`, pct(outputTokens, tokenBasis)),
    ].join('');
    const costBar = [
        tokenSegment('cheap', formatMoney(cachedInputCost, currency), pct(cachedInputCost, costBasis)),
        tokenSegment('mid', formatMoney(standardInputCost, currency), pct(standardInputCost, costBasis)),
        tokenSegment('hot', formatMoney(outputCost, currency), pct(outputCost, costBasis)),
    ].join('');

    instantResult.className = 'result';
    instantResult.innerHTML = `
        <p class="answer">${escapeHtml(data.response)}</p>
        <div class="price-headline">
            <div class="price-figure">
                <em>${escapeHtml(currency)}</em>
                <strong>${formatMoney(totalCost, '').trim()}</strong>
                <span>cost · this call</span>
            </div>
            <div class="price-meta">
                <span class="price-live"><span class="live-dot"></span>Live Azure retail rates</span>
                <span class="price-scale">${formatMoney(totalCost * 1000, currency)}<em>per 1,000 calls</em></span>
                <span class="price-scale">${formatMoney(totalCost * 1000000, currency)}<em>per 1M calls</em></span>
            </div>
        </div>
        <div class="tok-bars" aria-label="Token mix versus cost mix. Cheaper token types are cooler in color; output tokens are the most expensive per token. Input cost ${formatMoney(inputCost, currency)}, output cost ${formatMoney(outputCost, currency)}.">
            <div class="tok-row">
                <span class="tok-row-label">By token count</span>
                <div class="tok-track">${countBar}</div>
            </div>
            <div class="tok-row">
                <span class="tok-row-label">By cost</span>
                <div class="tok-track">${costBar}</div>
            </div>
            <div class="tok-legend">
                <span class="legend-item"><span class="swatch tok-cheap"></span>Cached input <strong class="legend-cost">${formatMoney(cachedInputCost, currency)}</strong></span>
                <span class="legend-item"><span class="swatch tok-mid"></span>Standard input <strong class="legend-cost">${formatMoney(standardInputCost, currency)}</strong></span>
                <span class="legend-item"><span class="swatch tok-hot"></span>Output <strong class="legend-cost">${formatMoney(outputCost, currency)}</strong></span>
                <span class="tok-scale-note">Cooler = cheaper per token; warmer = pricier.</span>
            </div>
        </div>
        <div class="rate-source">
            <span class="rate-source-title">Live from Azure Retail Prices API</span>
            <span class="rate-source-detail">${escapeHtml(pricing.region)} · ${escapeHtml(pricing.scope)} scope · retrieved ${escapeHtml(formatClock(pricing.retrievedAt))}</span>
        </div>
        <div class="rate-cards">
            ${renderRateCard('cheap', 'Cached input', pricing.cachedInputRateValue, currency, pricing.unitOfMeasure, pricing.cachedInputMeter, cachedInputTokens, cost.cachedInput)}
            ${renderRateCard('mid', 'Input', pricing.inputRateValue, currency, pricing.unitOfMeasure, pricing.inputMeter, standardInputTokens, cost.standardInput)}
            ${renderRateCard('hot', 'Output', pricing.outputRateValue, currency, pricing.unitOfMeasure, pricing.outputMeter, outputTokens, cost.output)}
        </div>
        <p class="fine-print">Usage: input ${formatInteger(usage.inputTokens)} · output ${formatInteger(outputTokens)} · total ${formatInteger(usage.totalTokens)} tokens. Meter prefix: ${escapeHtml(pricing.meterPrefix)}.</p>
        <p class="fine-print">Per-call cost is tiny by design; the projections multiply this run's live-priced tokens so the real rates stay tangible at scale.</p>
        ${renderInstantComparison(data, currency)}
    `;

    fitTokenSegments(instantResult);
}

// After layout, any segment whose label would clip mid-word hides its inline
// text and exposes the full value on hover via a title tooltip, so a too-narrow
// slice reads cleanly instead of showing a truncated "U.".
function fitTokenSegments(root) {
    root.querySelectorAll('.tok-seg').forEach((seg) => {
        const span = seg.querySelector('span');
        if (!span) {
            return;
        }
        const tight = span.scrollWidth > span.clientWidth + 1;
        seg.classList.toggle('tok-seg-tight', tight);
        if (tight) {
            seg.title = seg.dataset.label || span.textContent;
        } else {
            seg.removeAttribute('title');
        }
    });
}

function renderInstantComparison(data, currency) {
    const comparisons = Array.isArray(data.comparisons) ? data.comparisons : [];
    if (!comparisons.length) {
        return '';
    }
    const pricing = data.pricing || {};
    const instantTotal = Number(data.cost.total) || 0;
    const topMultiplier = comparisons.reduce((max, item) => Math.max(max, Number(item.multiplier) || 0), 0);
    const rows = [
        comparisonRow('Instant model', 'No deployment · every Foundry project', pricing.inputRateValue, pricing.outputRateValue, currency, instantTotal, 1, true),
        ...comparisons.map((item) => comparisonRow(item.label, item.note, item.inputRateValue, item.outputRateValue, currency, Number(item.callCost) || 0, Number(item.multiplier) || 0, false)),
    ].join('');
    const savingsLine = topMultiplier > 1
        ? `Instant is up to <strong>${formatMultiplier(topMultiplier)} cheaper</strong> than a deployed alternative for the same tokens.`
        : '';
    return `
        <div class="compare-block">
            <div class="compare-head">
                <span class="compare-title">Instant vs deployed pricing</span>
                ${savingsLine ? `<span class="compare-note">${savingsLine}</span>` : ''}
            </div>
            <div class="compare-rows">${rows}</div>
        </div>
    `;
}

function comparisonRow(name, note, inputRate, outputRate, currency, callCost, multiplier, isInstant) {
    const multLabel = isInstant ? 'baseline rate' : `${formatMultiplier(multiplier)} cost`;
    return `
        <div class="compare-row ${isInstant ? 'compare-row-instant' : ''}">
            <span class="compare-name">${escapeHtml(name)}<em>${escapeHtml(note)}</em></span>
            <span class="compare-rate">${formatRate(inputRate, currency)} in · ${formatRate(outputRate, currency)} out<em>per 1M tokens</em></span>
            <span class="compare-cost">${formatMoney(callCost, currency)}<em>${multLabel}</em></span>
        </div>
    `;
}

function formatMultiplier(value) {
    const amount = Number(value) || 0;
    const decimals = amount % 1 === 0 ? 0 : 1;
    return `${amount.toFixed(decimals)}&times;`;
}

function renderRateCard(tier, label, rateValue, currency, unit, meterName, tokens, callCost) {
    const hasRate = rateValue !== null && rateValue !== undefined && rateValue !== ''
        && meterName && meterName !== 'not found';
    if (!hasRate) {
        return `
            <div class="rate-card rate-card-missing rate-${tier}">
                <span class="rate-label">${escapeHtml(label)}</span>
                <strong class="rate-value">—</strong>
                <span class="rate-meter">No live ${escapeHtml(label.toLowerCase())} meter</span>
                <span class="rate-usage">${formatInteger(tokens)} tokens this call</span>
            </div>
        `;
    }
    const unitLabel = unit ? `/ ${escapeHtml(unit)} tokens` : '/ 1M tokens';
    return `
        <div class="rate-card rate-${tier}">
            <span class="rate-label">${escapeHtml(label)}<span class="rate-chip rate-chip-${tier}">${formatPerMillion(rateValue, currency)}</span></span>
            <strong class="rate-value">${formatRate(rateValue, currency)}<em>${unitLabel}</em></strong>
            <span class="rate-meter" title="${escapeHtml(meterName)}">${escapeHtml(meterName)}</span>
            <span class="rate-usage">${formatInteger(tokens)} tokens &rarr; ${formatMoney(callCost, currency)}</span>
        </div>
    `;
}

function renderCacheDemo(data) {
    const calls = Array.isArray(data.calls) ? data.calls : [];
    const warmUp = calls[0];
    const repeated = calls[1] || calls[0];
    const pricing = data.pricing || {};
    const currency = pricing.currencyCode || (repeated && repeated.cost && repeated.cost.currencyCode) || 'USD';

    const warmCache = repeated.cache || {};
    const cachedTokens = Number(warmCache.cachedInputTokens) || 0;
    const totalInput = Number(repeated.usage.inputTokens) || 0;
    const freshTokens = Math.max(0, totalInput - cachedTokens);
    const hitRate = Number(warmCache.cacheHitRate) || 0;
    const fillPercent = Math.max(0, Math.min(100, hitRate));
    const savings = Number(repeated.cost.cacheSavings) || 0;
    const hot = cachedTokens > 0;

    const answer = (repeated && repeated.response) || (warmUp && warmUp.response) || '';
    const cachedRate = pricing.cachedInputRate || 'cached-input meter';

    cacheResult.className = 'result';
    cacheResult.innerHTML = `
        <div class="cache-headline ${hot ? '' : 'cache-headline-cold'}">
            <div class="cache-figure">
                <strong data-count-to="${fillPercent.toFixed(2)}" data-count-suffix="%">0%</strong>
                <span>cache hit on reuse</span>
            </div>
            <div class="cache-headline-meta">
                <span class="cache-live"><span class="live-dot warm"></span>${hot ? 'Cache warmed in real time' : 'Cache primed — no reuse yet'}</span>
                <span class="cache-saved"><strong data-count-to="${cachedTokens}" data-count-int="1">0</strong> tokens served from cache</span>
            </div>
        </div>

        <div class="cache-gauge" aria-label="Cache fill ${formatPercent(hitRate)}">
            <div class="cache-gauge-head">
                <span class="cache-gauge-title">Model cache · ${escapeHtml(data.model || pricing.model || '')}</span>
                <span class="cache-gauge-state" data-state>Priming&hellip;</span>
            </div>
            <div class="cache-tank">
                <div class="cache-tank-fill" data-fill style="width: 0%"></div>
                <div class="cache-tank-label">
                    <span class="tank-cached"><span data-count-to="${cachedTokens}" data-count-int="1">0</span> cached</span>
                    <span class="tank-fresh">${formatInteger(freshTokens)} fresh</span>
                </div>
            </div>
            <div class="cache-legend">
                <span class="legend-item"><span class="swatch warm"></span>Cached prefix (warm)</span>
                <span class="legend-item"><span class="swatch cold"></span>Fresh input (cold)</span>
            </div>
        </div>

        <div class="cache-compare">
            ${renderCacheCall(warmUp, 'cold', currency)}
            <div class="cache-arrow"><span>reuses key</span></div>
            ${renderCacheCall(repeated, 'warm', currency)}
        </div>

        ${answer ? `<div class="cache-answer"><span class="cache-answer-label">Model answer</span><p class="answer">${escapeHtml(answer)}</p></div>` : ''}

        <div class="cache-loaded">
            <div class="cache-loaded-head">
                <span class="cache-loaded-title">What was loaded into cache</span>
                <span class="cache-loaded-meta">${formatInteger(data.referenceSections)} stable sections &middot; ${formatInteger(data.promptCharacters)} characters</span>
            </div>
            <div class="cache-key-row">
                <span class="cache-key-label">Cache key</span>
                <code class="cache-key">${escapeHtml(data.cacheKey)}</code>
            </div>
            <div class="cache-preview">${escapeHtml(data.promptPreview)}</div>
        </div>

        <div class="cache-savings">
            <span class="cache-savings-label">Saved by reuse</span>
            <span class="cache-savings-value">${formatMoney(savings, currency)}<em>per repeated call</em></span>
            <span class="cache-savings-value">${formatMoney(savings * 1000, currency)}<em>per 1,000 reuses</em></span>
        </div>

        <p class="fine-print">The warm-up call primes the cache for this key; the repeated call reuses the stable prefix. Cached input tokens are reported by the model API and billed at the cached-input meter (${escapeHtml(cachedRate)}).</p>
    `;

    animateCacheReveal(cacheResult, fillPercent);
}

function renderCacheCall(run, temp, currency) {
    if (!run) {
        return '';
    }
    const cache = run.cache || {};
    const cached = Number(cache.cachedInputTokens) || 0;
    const input = Number(run.usage.inputTokens) || 0;
    const pct = input > 0 ? Math.max(0, Math.min(100, (cached / input) * 100)) : 0;
    const isWarm = temp === 'warm';
    const badge = isWarm ? 'WARM' : 'COLD';
    const note = isWarm ? 'Reused the cached prefix' : 'Primed the cache';

    return `
        <section class="cache-call cache-call-${temp}">
            <div class="cache-call-head">
                <h3>${escapeHtml(run.label)}</h3>
                <span class="temp-badge temp-${temp}">${badge}</span>
            </div>
            <div class="cache-call-bar"><div class="cache-call-fill" data-fill-to="${pct.toFixed(2)}" style="width: 0%"></div></div>
            <div class="cache-call-metrics">
                <div><strong>${formatInteger(input)}</strong><span>input</span></div>
                <div><strong>${formatInteger(cached)}</strong><span>cached</span></div>
                <div><strong>${formatMoney(run.cost.total, currency)}</strong><span>cost</span></div>
            </div>
            <p class="cache-call-note">${escapeHtml(note)}</p>
        </section>
    `;
}

// Sequenced reveal so the cache visibly "warms up" after the data lands:
// a short priming beat, then the gauge fills and the token counters tick up.
function animateCacheReveal(root, fillPercent) {
    const fill = root.querySelector('[data-fill]');
    const state = root.querySelector('[data-state]');
    const callFills = Array.from(root.querySelectorAll('[data-fill-to]'));
    const counters = Array.from(root.querySelectorAll('[data-count-to]'));
    const duration = 1300;

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const settle = () => {
        if (fill) fill.style.width = fillPercent + '%';
        callFills.forEach((el) => { el.style.width = (Number(el.getAttribute('data-fill-to')) || 0) + '%'; });
        if (state) {
            state.textContent = fillPercent > 0 ? 'Cache warm' : 'Cache cold';
            state.classList.toggle('warm', fillPercent > 0);
        }
        counters.forEach((el) => {
            const target = Number(el.getAttribute('data-count-to')) || 0;
            const isInt = el.getAttribute('data-count-int') === '1';
            const suffix = el.getAttribute('data-count-suffix') || '';
            el.textContent = (isInt ? formatInteger(Math.round(target)) : target.toFixed(2)) + suffix;
        });
    };

    if (reduceMotion) {
        settle();
        return;
    }

    setTimeout(() => {
        if (fill) fill.style.width = fillPercent + '%';
        callFills.forEach((el) => { el.style.width = (Number(el.getAttribute('data-fill-to')) || 0) + '%'; });
        if (state) {
            state.textContent = fillPercent > 0 ? 'Cache warm' : 'Cache cold';
            state.classList.toggle('warm', fillPercent > 0);
        }
        const start = performance.now();
        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            counters.forEach((el) => {
                const target = Number(el.getAttribute('data-count-to')) || 0;
                const isInt = el.getAttribute('data-count-int') === '1';
                const suffix = el.getAttribute('data-count-suffix') || '';
                const value = target * eased;
                el.textContent = (isInt ? formatInteger(Math.round(value)) : value.toFixed(2)) + suffix;
            });
            if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }, 320);
}

function renderCompaction(data) {
    const compaction = data.compaction;
    const cost = data.cost;
    const sourceTokens = Number(compaction.sourceTokens) || 0;
    const compactedTokens = Number(compaction.compactedTokens) || 0;
    const tokensSaved = Number(compaction.tokensSaved) || 0;
    const reductionRate = Number(compaction.tokenReductionRate) || 0;
    const keptPercent = sourceTokens > 0 ? Math.max(0, Math.min(100, (compactedTokens / sourceTokens) * 100)) : 0;
    const freedPercent = Math.max(0, 100 - keptPercent);
    const ratio = compactedTokens > 0 ? sourceTokens / compactedTokens : 0;
    const ratioLabel = ratio >= 1.05 ? `${ratio.toFixed(1)}\u00d7 smaller` : 'about the same size';

    // Size the before/after panels so their visible heights echo the token proportion:
    // the compacted panel is roughly as tall as the share of tokens it keeps.
    const beforeMaxHeight = 240;
    const afterMaxHeight = Math.max(72, Math.round(beforeMaxHeight * (keptPercent / 100)));

    compactResult.className = 'result';
    compactResult.innerHTML = `
        <div class="compaction-headline">
            <div class="headline-figure">
                <strong>${Math.round(reductionRate)}%</strong>
                <span>fewer tokens</span>
            </div>
            <div class="headline-meta">
                <span class="headline-ratio">${ratioLabel}</span>
                <span class="headline-saved">${formatInteger(tokensSaved)} tokens reclaimed on every future reuse</span>
            </div>
        </div>
        <div class="budget" aria-label="Of ${formatInteger(sourceTokens)} original tokens, ${formatInteger(compactedTokens)} kept and ${formatInteger(tokensSaved)} reclaimed">
            <div class="budget-track">
                <div class="budget-kept" style="width: ${keptPercent}%"><span>${formatInteger(compactedTokens)} kept</span></div>
                <div class="budget-freed" style="width: ${freedPercent}%"><span>${formatInteger(tokensSaved)} reclaimed</span></div>
            </div>
            <div class="budget-legend">
                <span class="legend-item"><span class="swatch kept"></span>Durable context kept</span>
                <span class="legend-item"><span class="swatch freed"></span>Reclaimed for future turns</span>
            </div>
        </div>
        <div class="compaction-columns">
            <div class="text-col text-before">
                <div class="text-col-head">
                    <span class="text-col-label">Before · working notes</span>
                    <span class="text-col-count">${formatInteger(sourceTokens)} tokens</span>
                </div>
                <div class="text-body" style="max-height: ${beforeMaxHeight}px">${escapeHtml(data.prompt)}</div>
            </div>
            <div class="text-col text-after">
                <div class="text-col-head">
                    <span class="text-col-label">After · compacted context</span>
                    <span class="text-col-count">${formatInteger(compactedTokens)} tokens</span>
                </div>
                <div class="text-body" style="max-height: ${afterMaxHeight}px">${escapeHtml(data.compactedPrompt)}</div>
            </div>
        </div>
        <p class="fine-print">Reduction: ${formatPercent(compaction.tokenReductionRate)} · Source characters: ${formatInteger(data.sourceCharacters)} · Compacted characters: ${formatInteger(data.compactedCharacters)}</p>
        <p class="fine-print">Compaction call usage: input ${formatInteger(data.usage.inputTokens)} tokens · output ${formatInteger(data.usage.outputTokens)} tokens · total ${formatInteger(data.usage.totalTokens)} tokens</p>
        <p class="fine-print">Estimated compaction cost: ${cost.currencyCode} ${cost.total} (input ${cost.currencyCode} ${cost.standardInput}, output ${cost.currencyCode} ${cost.output})</p>
        <p class="fine-print">Token counts come from the model API. Source tokens include the submitted notes and compaction instructions; reclaimed tokens are saved on each future turn that reuses the summary instead of the raw notes.</p>
    `;
}

function renderCaveman(data) {
    const caveman = data.caveman || {};
    const normalCost = data.normalCost || {};
    const cavemanCost = data.cavemanCost || {};
    const pricing = data.pricing || {};
    const currency = pricing.currencyCode || normalCost.currencyCode || 'USD';

    const normalTokens = Number(caveman.normalOutputTokens) || 0;
    const cavemanTokens = Number(caveman.cavemanOutputTokens) || 0;
    const tokensSaved = Number(caveman.tokensSaved) || 0;
    const reductionRate = Number(caveman.tokenReductionRate) || 0;
    const keptPercent = normalTokens > 0 ? Math.max(0, Math.min(100, (cavemanTokens / normalTokens) * 100)) : 0;
    const freedPercent = Math.max(0, 100 - keptPercent);
    const ratio = cavemanTokens > 0 ? normalTokens / cavemanTokens : 0;
    const ratioLabel = ratio >= 1.05 ? `${ratio.toFixed(1)}\u00d7 fewer words` : 'about the same size';

    const normalOutputCost = Number(normalCost.output) || 0;
    const cavemanOutputCost = Number(cavemanCost.output) || 0;
    const outputSaved = Number(data.outputCostSaved) || Math.max(0, normalOutputCost - cavemanOutputCost);

    cavemanResult.className = 'result';
    cavemanResult.innerHTML = `
        <div class="compaction-headline caveman-headline">
            <div class="headline-figure">
                <strong>${Math.round(reductionRate)}%</strong>
                <span>fewer output tokens</span>
            </div>
            <div class="headline-meta">
                <span class="headline-ratio">${ratioLabel}</span>
                <span class="headline-saved">${formatInteger(tokensSaved)} output tokens dropped &mdash; same technical answer</span>
            </div>
        </div>
        <div class="budget" aria-label="Of ${formatInteger(normalTokens)} normal output tokens, ${formatInteger(cavemanTokens)} kept and ${formatInteger(tokensSaved)} saved by caveman speak">
            <div class="budget-track">
                <div class="budget-kept" style="width: ${keptPercent}%"><span>${formatInteger(cavemanTokens)} caveman</span></div>
                <div class="budget-freed budget-freed-caveman" style="width: ${freedPercent}%"><span>${formatInteger(tokensSaved)} saved</span></div>
            </div>
            <div class="budget-legend">
                <span class="legend-item"><span class="swatch kept"></span>Caveman output kept</span>
                <span class="legend-item"><span class="swatch caveman"></span>Filler words dropped</span>
            </div>
        </div>
        <div class="caveman-columns">
            <div class="text-col text-before">
                <div class="text-col-head">
                    <span class="text-col-label">Before &middot; normal answer</span>
                    <span class="text-col-count">${formatInteger(normalTokens)} output tokens</span>
                </div>
                <div class="text-body" style="max-height: 260px">${escapeHtml(data.normalResponse)}</div>
            </div>
            <div class="text-col text-after">
                <div class="text-col-head">
                    <span class="text-col-label">After &middot; caveman speak</span>
                    <span class="text-col-count">${formatInteger(cavemanTokens)} output tokens</span>
                </div>
                <div class="text-body" style="max-height: 260px">${escapeHtml(data.cavemanResponse)}</div>
            </div>
        </div>
        <div class="cache-savings">
            <span class="cache-savings-label">Saved on output</span>
            <span class="cache-savings-value">${formatMoney(outputSaved, currency)}<em>per answer</em></span>
            <span class="cache-savings-value">${formatMoney(outputSaved * 1000, currency)}<em>per 1,000 answers</em></span>
            <span class="cache-savings-value">${formatMoney(outputSaved * 1000000, currency)}<em>per 1M answers</em></span>
        </div>
        <p class="fine-print">Output cost: normal ${formatMoney(normalOutputCost, currency)} &rarr; caveman ${formatMoney(cavemanOutputCost, currency)} at ${escapeHtml(pricing.outputRate)}. Output tokens are the priciest kind, so trimming them is where the savings land.</p>
        <p class="fine-print">Normal call: input ${formatInteger(data.normalUsage.inputTokens)} &middot; output ${formatInteger(data.normalUsage.outputTokens)} &middot; total ${formatInteger(data.normalUsage.totalTokens)} tokens. Caveman call: input ${formatInteger(data.cavemanUsage.inputTokens)} &middot; output ${formatInteger(data.cavemanUsage.outputTokens)} &middot; total ${formatInteger(data.cavemanUsage.totalTokens)} tokens.</p>
        <p class="fine-print">The same question is asked both times; caveman compresses only the answer. Output tokens are the priciest kind and drop the most, while code, commands, and identifiers stay exact. The caveman style guide adds a little fixed input, but in real use it lives once in the system prompt and can be cached. Inspired by <a href="https://github.com/JuliusBrussee/caveman" target="_blank" rel="noopener noreferrer">JuliusBrussee/caveman</a>.</p>
    `;
}

function showError(target, error) {
    target.className = 'result error';
    target.textContent = error.message;
}

async function loadConfig() {
    const response = await fetch('/api/config');
    const config = await response.json();
    document.querySelector('#modelValue').textContent = config.model;
    document.querySelector('#meterValue').textContent = config.pricingMeterPrefix;
    document.querySelector('#regionValue').textContent = `${config.pricingRegion} / ${config.pricingScope}`;
}

instantButton.addEventListener('click', async () => {
    instantButton.disabled = true;
    instantResult.className = 'result empty';
    instantResult.textContent = 'Calling the instant model...';
    try {
        renderInstant(await postJson('/api/instant'));
    } catch (error) {
        showError(instantResult, error);
    } finally {
        instantButton.disabled = false;
    }
});

cacheButton.addEventListener('click', async () => {
    cacheButton.disabled = true;
    cacheResult.className = 'result empty';
    cacheResult.textContent = 'Running warm-up and repeated prompt calls...';
    try {
        renderCacheDemo(await postJson('/api/cache-demo'));
    } catch (error) {
        showError(cacheResult, error);
    } finally {
        cacheButton.disabled = false;
    }
});

compactButton.addEventListener('click', async () => {
    compactButton.disabled = true;
    compactResult.className = 'result empty';
    compactResult.textContent = 'Compacting working notes...';
    try {
        renderCompaction(await postJson('/api/compact-demo'));
    } catch (error) {
        showError(compactResult, error);
    } finally {
        compactButton.disabled = false;
    }
});

cavemanButton.addEventListener('click', async () => {
    cavemanButton.disabled = true;
    cavemanResult.className = 'result empty';
    cavemanResult.textContent = 'Asking normally, then like a caveman...';
    try {
        renderCaveman(await postJson('/api/caveman-demo'));
    } catch (error) {
        showError(cavemanResult, error);
    } finally {
        cavemanButton.disabled = false;
    }
});

loadConfig().catch((error) => {
    document.querySelector('#configStrip').textContent = error.message;
});