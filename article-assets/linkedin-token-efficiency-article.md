# Token Efficiency Is a Product Feature

## A technical tour of a Java + Microsoft Foundry instant-models demo

Live demo: [http://aka.ms/costs](http://aka.ms/costs) · Repo: [https://github.com/roryp/instantmodels](https://github.com/roryp/instantmodels)

![Token Efficiency dashboard](instant-models-dashboard.png){ width=6.5in }

*Four live workflows on one screen — a zero-deployment instant model call, a prompt-cache warm/repeat comparison, a compaction pass, and a caveman-speak output-compression pass. Every number is priced against live Azure Retail Prices meters, not a hardcoded table. (Figures shown are representative; live values vary by prompt, region, quota, and pricing response.)*

## Why this exists

Most "AI cost" conversations happen after the bill arrives. This flips that: a Spring Boot dashboard backed by Microsoft Foundry **instant models** where, for every call, you see input tokens, output tokens, cached input tokens, the exact retail meter each one hits, and the cost — while you are still designing the feature.

What makes it worth a look:

- **Zero-deployment inference.** `gpt-chat-latest` is called *by name* through the Responses API — nothing to provision — and bills up to **2.5× cheaper** than the equivalent deployed tiers.
- **Pricing resolved live.** No prices in source. Each run queries the Azure Retail Prices API and *discovers* the standard-input, cached-input, and output meters by name.
- **Cache hit read from the model**, not estimated — straight from `usage.inputTokensDetails().cachedTokens()`.
- **Compaction with a measured token delta**, so "spend tokens now to save later" stops being a hand-wave.
- **Passwordless throughout** — `DefaultAzureCredential` locally, managed identity in Azure. No keys in the sample.

## Architecture

Java 21, Spring Boot, Thymeleaf, the Azure AI Agents SDK for the Responses API, and a small `java.net.http` client for pricing. One public server-rendered page posts fixed demo actions back to Spring; the browser never receives model-call JSON endpoints.

```text
Browser (server-rendered dashboard)
    │  POST / with fixed demo action
   ▼
@Controller ──▶ cached fixed result ──▶ DemoRunService
   │ Azure AI Agents SDK        │ java.net.http + OData
   ▼                            ▼
Foundry Responses API     Azure Retail Prices API
gpt-chat-latest (by name) prices.azure.com (live meters)
```

## 1. Instant models: inference with no deployment

The baseline call — prompt in, response out — with Entra auth and no secrets:

```java
Response response = responsesClient().getResponseService().create(
    new ResponseCreateParams.Builder()
        .input(prompt)
        .model(InstantModelsConfig.model())
        .build());
```

The novelty is what *isn't* there: no deployment, no reserved throughput, no endpoint config. `gpt-chat-latest` is available to every Foundry project and billed per token — and the demo proves the cost claim by pricing the same tokens against the deployed alternatives it discovers from live meters.

![Instant demo priced live against Azure Retail Prices meters](instant-models-results.png){ width=6.5in }

*Representative run: 19 input + 31 output tokens cost USD 0.001025 (≈ USD 1.03 / 1,000 calls). The "instant vs deployed" panel ranks the same tokens against Data Zone (1.1×) and Priority Processing (2.5×) — all from live rates.*

## 2. The live pricing engine

Nothing is hardcoded. Each run builds an OData filter and pages the public Retail Prices API:

```java
String filter = "serviceName eq 'Foundry Models' and priceType eq 'Consumption'"
        + " and armRegionName eq '" + escapeOData(region) + "'"
        + " and contains(meterName, '" + escapeOData(meterPrefix) + "')";
```

A model maps to a *family* of terse, overlapping meter names — `5.5 ShortCo inp Gl 1M Tokens`, `... cd inp ...`, `... opt ...`. The client resolves each role with strict heuristics, then computes money in `BigDecimal` (per-token division carried to 12 places, total rounded to 8) so sub-cent costs stay honest at scale:

```java
private boolean isStandardInputMeter(String n) {
    return containsWord(n, "inp") && !containsSequence(n, "cd inp") && !containsWord(n, "opt");
}
private boolean isCachedInputMeter(String n) { return containsSequence(n, "cd inp"); }
private boolean isOutputMeter(String n)      { return containsWord(n, "opt"); }
```

The payoff: the dashboard reports not just *what* a call cost, but *which* live meter it hit, in which region, retrieved when — and builds the comparison from the same data.

## 3. Prompt caching, from real telemetry

The demo sends a long, stable prompt — 120 identical sections, ~61k characters — **twice** under a stable `promptCacheKey`. The hit is read from the usage payload, not inferred, and split for pricing:

```java
ResponseCreateParams request = new ResponseCreateParams.Builder()
        .input(prompt)
        .model(InstantModelsConfig.model())
        .maxOutputTokens(80)
        .promptCacheKey(cacheKey)
        .build();

long cachedInputTokens = Math.min(cachedInputTokens(usage), usage.inputTokens());
long standardInputTokens = usage.inputTokens() - cachedInputTokens;
```

![Prompt cache demo showing a 96.86% cache hit on reuse](prompt-cache-results.png){ width=6.2in }

*Cold call: 0 cached tokens, USD 0.0513. Warm call: 9,728 of 10,043 input tokens served from cache (96.86% hit), USD 0.007519 — USD 43.78 saved per 1,000 reuses, with the prefix billed at USD 0.50 / 1M cached vs USD 5.00 / 1M standard.*

The lesson is structural: caching rewards prompts where stable context is physically separated from volatile input, so the cached-input meter does the heavy lifting.

## 4. Compaction — and why this demo keeps it human-readable

Long sessions get expensive when every turn drags the full history of exploration, dead ends, and logs. Compaction trades one summarization call now for cheaper context on every later turn. It uses an explicit instruction and shows the before/after token delta:

```java
Response response = responsesClient().getResponseService().create(
    new ResponseCreateParams.Builder()
        .input(prompt)                       // long working notes
        .instructions(COMPACTION_INSTRUCTIONS)
        .model(InstantModelsConfig.model())
        .maxOutputTokens(360)
        .build());

long reclaimed = tokensSaved(usage.inputTokens(), usage.outputTokens());
```

![Compaction demo: 419 source tokens reduced to 265, a 37% drop](compaction-results.png){ width=6.2in }

*Representative pass: 419 tokens of notes → a 265-token summary (37% fewer, 1.6× smaller), reclaiming 154 tokens per future reuse. The compaction call costs USD 0.01004500; the win lands on every later turn that ships the summary instead of the raw notes.*

**Why the instruction-prompt version, not the native one?** The Responses API now ships *native* context management — `truncation: "auto"` to drop the oldest items past the context window, a `context_management` option with a `compact_threshold` for server-side compaction mid-stream, and a standalone `/responses/compact` endpoint. But those return an **opaque, encrypted compaction item** built for the model to consume on the next turn, not for a human to read. You cannot put it on a dashboard, diff it, or show the token delta line by line. For a *teaching* tool whose whole job is to make the tradeoff visible, an instruction prompt that produces legible before/after text and an auditable savings number is the right call. In **production**, the native primitives are usually better — cheaper to wire up and tuned for the model, not for display.

## 5. Caveman speak — compressing the output, not the meaning

Compaction shrinks the *input* you carry forward; the fourth demo attacks the *output* you pay to generate. Inspired by the [caveman](https://github.com/JuliusBrussee/caveman) skill — *"why use many token when few do trick"* — it answers the same question twice, once normally and once under a system instruction to drop filler and speak in terse fragments while keeping every technical fact, code block, and command exact:

```java
CallSummary normal  = summarize("Normal answer",  createAnswer(prompt, CAVEMAN_NORMAL_INSTRUCTIONS), pricing);
CallSummary caveman = summarize("Caveman answer", createAnswer(prompt, CAVEMAN_INSTRUCTIONS), pricing);
```

![Caveman speak demo: a normal answer compressed to terse fragments with the same facts](caveman-results.png){ width=6.2in }

*Representative deployed run: a React re-render explanation dropped from 469 output tokens to 327 (≈30% fewer, 1.4× smaller), keeping the fix (`useMemo`, `useCallback`) and code exact — about USD 0.0043 saved per answer at USD 30 / 1M output. Only output tokens shrink; the question is unchanged.*

Because output bills at the highest rate — USD 30 / 1M versus USD 5 / 1M input for `5.5 ShortCo` — trimming verbose answers is often the cheapest win. The caveman style guide costs a little fixed input per call, but in production it lives once in a system prompt (and can be prompt-cached), so the output savings compound across a conversation. Brain still big, mouth small.

## The cost model

The three token classes bill at different rates, so the estimate keeps them separate and matches each to its discovered meter:

```text
cost = standard_input_tokens * standard_input_rate
     + cached_input_tokens   * cached_input_rate
     + output_tokens         * output_rate
```

Because rates are live and math is `BigDecimal`, the dashboard attributes cost to a cause — repeated input you could cache, verbose output you could constrain — instead of one opaque number.

## Auth and deploy

`az login` feeds `DefaultAzureCredential` locally; in Azure the Container App runs under a managed identity holding exactly two roles — **AcrPull** and **Azure AI User**. No keys shipped. Infra (Foundry, ACR, Container Apps, Log Analytics, identity, RBAC) is `azd` + Bicep:

```powershell
az login
azd up
```

## Practical lessons

- Direct call for small tasks; skip agent orchestration you will not use.
- Smallest model that reliably completes the work.
- Physically separate stable context from request-specific input so caching engages.
- Keep `promptCacheKey` stable — churn it and the benefit evaporates.
- Treat compaction as break-even math: reclaimed tokens per future turn vs the one-time cost.
- Budget output tokens like input tokens; at USD 30 / 1M, output dominated the instant call's cost.
- Compress the *answer*, not just the prompt — terse "caveman" output can cut output tokens ~40–65% while keeping code and facts exact.
- Price against live meters with region, scope, and timestamp visible.

## Try it

```powershell
mvn test
mvn spring-boot:run   # then open http://localhost:8080
```

Token efficiency is not about shrinking prompts to nothing — it is about spending the right context, on the right model, in the right workflow, and being able to *see* that choice in real numbers. That is what turns cost from an afterthought into a product feature.

Live demo: [http://aka.ms/costs](http://aka.ms/costs) · Repo: [https://github.com/roryp/instantmodels](https://github.com/roryp/instantmodels)