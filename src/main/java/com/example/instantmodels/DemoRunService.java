package com.example.instantmodels;

import com.azure.ai.agents.AgentsClientBuilder;
import com.azure.ai.agents.ResponsesClient;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.openai.models.responses.Response;
import com.openai.models.responses.ResponseCreateParams;
import com.openai.models.responses.ResponseUsage;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

@Service
class DemoRunService {
    private static final String CACHE_KEY_PREFIX = "im-web-cache";
    private static final int REFERENCE_SECTION_COUNT = 120;
    private static final String REFERENCE_INTRO = String.join(" ",
            "You are evaluating a reusable internal reference document about instant models.",
            "Use only the reference material below, then answer the final question briefly.");
    private static final String REFERENCE_SECTION_TEXT = String.join(" ",
            "Instant models let developers call supported models by name without creating deployments.",
            "They are useful for prototyping, model comparison, early workflow testing, and cost exploration.",
            "Applications should still consider deployments when they need reserved throughput, custom controls,",
            "data residency choices, or production isolation.",
            "Prompt caching is useful when a large stable prefix is reused across calls because cached input",
            "tokens can be billed differently from standard input tokens.");
    private static final String DEFAULT_COMPACT_PROMPT = String.join("\n",
            "Goal: ship a small Java dashboard change that explains instant model throughput limits.",
            "Context gathered: Microsoft Foundry instant models are preview-scoped to West US 3 and can be called by model name without creating a deployment. They draw from a per-model global quota pool assigned to the subscription. The app should keep token usage, pricing, and cache behavior visible because this repository is a cost-transparency sample.",
            "Online docs checked: instant models are for getting started, prototyping, and trying new models. Deployments remain the right choice for reserved throughput, custom guardrails, data residency requirements, endpoint-specific configuration, fine-grained quota partitioning, fine-tuned models, or predictable production capacity.",
            "Sanitized validation finding: one development subscription reported Tier 5 Global Standard quota for gpt-chat-latest of 50,000 requests per minute and 5,000,000 tokens per minute, with no Global Standard deployment quota reserved at the time of the check. Do not include subscription IDs, tenant IDs, user names, or generated Azure environment files in docs.",
            "Implementation notes: update README in the Example overview and Token Efficiency sections, keep dashboard controls compact, run mvn test after Java changes, and use azd up for full deployment validation rather than manual container app commands.",
            "Open question: after the docs update, add a dashboard example that compacts long working notes into a shorter durable summary and shows the token savings for future prompts.");
    private static final String COMPACTION_INSTRUCTIONS = String.join(" ",
            "Compact the submitted working notes into a concise durable context summary for a future assistant turn.",
            "Use at most six compact sentences, no markdown bullets, and no nested lists.",
            "Preserve only next-turn essentials: goal, key facts, docs or files to update, validation and deploy commands, blockers, and privacy constraints.",
            "Remove repetition, resolved dead ends, greetings, transient logs, and exact values that are not needed for the next step.",
            "Summarize quota findings as sanitized quota evidence instead of repeating every number.",
            "Omit optional follow-ups unless they are required for the next action.",
            "Return only the compacted summary.");
    private static final String DEFAULT_CAVEMAN_PROMPT = String.join(" ",
            "Why does passing an inline object or arrow function as a prop cause a React child component",
            "to re-render on every parent render, and how do I prevent it?");
    private static final String CAVEMAN_NORMAL_INSTRUCTIONS = String.join(" ",
            "You are a helpful senior software engineer.",
            "Answer the developer's question clearly and completely in normal prose.");
    private static final String CAVEMAN_INSTRUCTIONS = String.join(" ",
            "Answer like a caveman to save output tokens, inspired by the caveman skill:",
            "why use many token when few do trick.",
            "Drop filler words, articles, and pleasantries; use short telegraphic fragments instead of full sentences.",
            "Keep every technical fact, step, and caveat accurate. Brain still big, mouth small.",
            "Keep code, commands, file paths, API names, and error strings exact and unchanged.",
            "Reply in the same language as the question. Compress the style, not the meaning.");

    private final TokenTelemetry telemetry;

    DemoRunService(TokenTelemetry telemetry) {
        this.telemetry = telemetry;
    }

    InstantDemoResult runInstantDemo(String promptOverride) {
        String prompt = InstantModelsConfig.valueOrDefault(promptOverride, InstantModelsConfig.prompt());
        Response response = execute("instant", new ResponseCreateParams.Builder()
                .input(prompt)
                .model(InstantModelsConfig.model())
                .build());

        ModelPricing pricing = pricing();
        CallSummary summary = summarize("instant", "Instant model call", response, pricing);
        PricingEstimate estimate = pricing.estimateCost(usage(response));
        return new InstantDemoResult(
                InstantModelsConfig.model(),
                prompt,
                outputText(response),
                summary.usage(),
                summary.cache(),
                summary.cost(),
                pricingSummary(pricing),
                buildComparisons(pricing, estimate));
    }

    PromptCacheDemoResult runPromptCacheDemo() {
        ModelPricing pricing = pricing();
        String runId = UUID.randomUUID().toString();
        String cacheKey = CACHE_KEY_PREFIX + "-" + runId.replace("-", "");
        String prompt = cacheablePrompt(runId);

        Response warmUp = createCachedResponse(prompt, cacheKey);
        Response repeated = createCachedResponse(prompt, cacheKey);

        return new PromptCacheDemoResult(
                InstantModelsConfig.model(),
                cacheKey,
                prompt.length(),
                REFERENCE_SECTION_COUNT,
                cacheablePromptPreview(),
                pricingSummary(pricing),
                List.of(
                        summarize("prompt-cache", "Warm-up call", warmUp, pricing),
                        summarize("prompt-cache", "Repeated call", repeated, pricing)));
    }

    CompactDemoResult runCompactDemo(String promptOverride) {
        String prompt = InstantModelsConfig.valueOrDefault(promptOverride, DEFAULT_COMPACT_PROMPT);
        Response response = execute("compaction", new ResponseCreateParams.Builder()
                .input(prompt)
                .instructions(COMPACTION_INSTRUCTIONS)
                .model(InstantModelsConfig.model())
                .maxOutputTokens(360)
                .build());

        ResponseUsage usage = usage(response);
        ModelPricing pricing = pricing();
        PricingEstimate estimate = pricing.estimateCost(usage);
        telemetry.recordCost("compaction", InstantModelsConfig.model(), estimate.currencyCode(),
                estimate.totalCost().doubleValue());
        String compactedPrompt = outputText(response);
        long compactedTokens = usage.outputTokens();

        return new CompactDemoResult(
                InstantModelsConfig.model(),
                prompt,
                compactedPrompt,
                prompt.length(),
                compactedPrompt.length(),
                new UsageSummary(usage.inputTokens(), usage.outputTokens(), usage.totalTokens()),
                new CompactionSummary(
                        usage.inputTokens(),
                        compactedTokens,
                        tokensSaved(usage.inputTokens(), compactedTokens),
                        tokenReductionRate(usage.inputTokens(), compactedTokens)),
                new CostSummary(
                        estimate.currencyCode(),
                        formatCost(estimate.standardInputCost()),
                        formatCost(estimate.cachedInputCost()),
                        formatCost(estimate.outputCost()),
                        estimate.totalCost().toPlainString(),
                        formatCost(BigDecimal.ZERO)),
                pricingSummary(pricing));
    }

    CavemanDemoResult runCavemanDemo(String promptOverride) {
        String prompt = InstantModelsConfig.valueOrDefault(promptOverride, DEFAULT_CAVEMAN_PROMPT);
        ModelPricing pricing = pricing();

        CallSummary normal = summarize("caveman-normal", "Normal answer",
                createAnswer("caveman-normal", prompt, CAVEMAN_NORMAL_INSTRUCTIONS), pricing);
        CallSummary caveman = summarize("caveman", "Caveman answer",
                createAnswer("caveman", prompt, CAVEMAN_INSTRUCTIONS), pricing);

        long normalOutputTokens = normal.usage().outputTokens();
        long cavemanOutputTokens = caveman.usage().outputTokens();
        BigDecimal outputCostSaved = pricing.outputMeter().costForTokens(normalOutputTokens)
                .subtract(pricing.outputMeter().costForTokens(cavemanOutputTokens))
                .max(BigDecimal.ZERO);

        return new CavemanDemoResult(
                InstantModelsConfig.model(),
                prompt,
                normal.response(),
                caveman.response(),
                normal.usage(),
                caveman.usage(),
                new CavemanSummary(
                        normalOutputTokens,
                        cavemanOutputTokens,
                        tokensSaved(normalOutputTokens, cavemanOutputTokens),
                        tokenReductionRate(normalOutputTokens, cavemanOutputTokens)),
                normal.cost(),
                caveman.cost(),
                formatCost(outputCostSaved),
                pricingSummary(pricing));
    }

    private Response createAnswer(String demo, String prompt, String instructions) {
        return execute(demo, new ResponseCreateParams.Builder()
                .input(prompt)
                .instructions(instructions)
                .model(InstantModelsConfig.model())
                .maxOutputTokens(600)
                .build());
    }

    private Response createCachedResponse(String prompt, String cacheKey) {
        ResponseCreateParams responseRequest = new ResponseCreateParams.Builder()
                .input(prompt)
                .model(InstantModelsConfig.model())
                .maxOutputTokens(80)
                .promptCacheKey(cacheKey)
                .build();

        return execute("prompt-cache", responseRequest);
    }

    private Response execute(String demo, ResponseCreateParams params) {
        return telemetry.recordCall(demo, InstantModelsConfig.model(),
                () -> responsesClient().getResponseService().create(params));
    }

    private ResponsesClient responsesClient() {
        return new AgentsClientBuilder()
                .credential(new DefaultAzureCredentialBuilder().build())
                .endpoint(InstantModelsConfig.projectEndpoint())
                .buildResponsesClient();
    }

    private ModelPricing pricing() {
        return new RetailPricingClient().getPricing(
                InstantModelsConfig.model(),
                InstantModelsConfig.pricingMeterPrefix(),
                InstantModelsConfig.pricingRegion(),
                InstantModelsConfig.pricingCurrency(),
                InstantModelsConfig.pricingScope());
    }

    private CallSummary summarize(String demo, String label, Response response, ModelPricing pricing) {
        ResponseUsage usage = usage(response);
        PricingEstimate estimate = pricing.estimateCost(usage);
        telemetry.recordCost(demo, InstantModelsConfig.model(), estimate.currencyCode(),
                estimate.totalCost().doubleValue());
        BigDecimal uncachedCost = pricing.inputMeter().costForTokens(usage.inputTokens())
                .add(pricing.outputMeter().costForTokens(usage.outputTokens()))
                .setScale(8, RoundingMode.HALF_UP);
        BigDecimal cacheSavings = uncachedCost.subtract(estimate.totalCost()).max(BigDecimal.ZERO);

        return new CallSummary(
                label,
                outputText(response),
                new UsageSummary(usage.inputTokens(), usage.outputTokens(), usage.totalTokens()),
                new CacheSummary(
                        estimate.standardInputTokens(),
                        estimate.cachedInputTokens(),
                        cacheHitRate(estimate.standardInputTokens(), estimate.cachedInputTokens())),
                new CostSummary(
                        estimate.currencyCode(),
                        formatCost(estimate.standardInputCost()),
                        formatCost(estimate.cachedInputCost()),
                        formatCost(estimate.outputCost()),
                        estimate.totalCost().toPlainString(),
                        formatCost(cacheSavings)));
    }

    private List<InstantPriceComparison> buildComparisons(ModelPricing pricing, PricingEstimate estimate) {
        BigDecimal instantTotal = estimate.totalCost();
        List<InstantPriceComparison> comparisons = new ArrayList<>();
        for (PricingBaseline baseline : pricing.comparisonBaselines()) {
            BigDecimal baselineTotal = baseline.totalCostForTokens(
                    estimate.standardInputTokens(), estimate.cachedInputTokens(), estimate.outputTokens());
            BigDecimal multiplier = instantTotal.signum() == 0
                    ? BigDecimal.ZERO
                    : baselineTotal.divide(instantTotal, 2, RoundingMode.HALF_UP);
            if (multiplier.compareTo(BigDecimal.ONE) <= 0) {
                continue;
            }
            comparisons.add(new InstantPriceComparison(
                    baseline.id(),
                    baseline.label(),
                    baseline.note(),
                    baseline.inputMeter().pricePerMillionTokens().toPlainString(),
                    baseline.cachedInputMeter().map(meter -> meter.pricePerMillionTokens().toPlainString()).orElse(null),
                    baseline.outputMeter().pricePerMillionTokens().toPlainString(),
                    formatCost(baselineTotal),
                    multiplier.toPlainString()));
        }
        return comparisons;
    }

    private PricingSummary pricingSummary(ModelPricing pricing) {
        return new PricingSummary(
                pricing.selectedModel(),
                pricing.meterPrefix(),
                pricing.region(),
                InstantModelsConfig.pricingScope(),
                pricing.retrievedAt().toString(),
                pricing.currencyCode(),
                pricing.inputMeter().unitOfMeasure(),
                pricing.inputMeter().displayRate(),
                pricing.cachedInputMeter().map(RetailPriceMeter::displayRate).orElse("not found"),
                pricing.outputMeter().displayRate(),
                pricing.inputMeter().pricePerMillionTokens().toPlainString(),
                pricing.cachedInputMeter().map(meter -> meter.pricePerMillionTokens().toPlainString()).orElse(null),
                pricing.outputMeter().pricePerMillionTokens().toPlainString(),
                pricing.inputMeter().meterName(),
                pricing.cachedInputMeter().map(RetailPriceMeter::meterName).orElse("not found"),
                pricing.outputMeter().meterName());
    }

        private static ResponseUsage usage(Response response) {
                return response.usage()
                                .orElseThrow(() -> new IllegalStateException("Usage was not returned by the service."));
        }

    private static String cacheablePrompt(String runId) {
        StringBuilder builder = new StringBuilder();
        builder.append(REFERENCE_INTRO).append("\n\n")
                .append("Demo run id: ").append(runId).append("\n\n")
                .append("Reference material:\n");

        for (int index = 1; index <= REFERENCE_SECTION_COUNT; index++) {
            builder.append("Section ").append(index).append(": ")
                    .append(REFERENCE_SECTION_TEXT).append("\n");
        }

        builder.append("\nFinal question: In one sentence, why is prompt caching useful for this instant models demo?");
        return builder.toString();
    }

    private static String cacheablePromptPreview() {
        return REFERENCE_INTRO + "\n\nReference material:\n"
                + "Section 1: " + REFERENCE_SECTION_TEXT + "\n"
                + "Section 2: " + REFERENCE_SECTION_TEXT + "\n"
                + "\u2026 (" + (REFERENCE_SECTION_COUNT - 2) + " more identical stable sections reused on every call)";
    }

    private static String outputText(Response response) {
        String text = response.output().stream()
                .flatMap(item -> item.message().stream())
                .flatMap(message -> message.content().stream())
                .flatMap(content -> content.outputText().stream())
                .map(outputText -> outputText.text())
                .collect(Collectors.joining(System.lineSeparator()));

        return text.isBlank() ? response.output().toString() : text;
    }

    private static String formatCost(BigDecimal cost) {
        return cost.setScale(8, RoundingMode.HALF_UP).toPlainString();
    }

    private static double cacheHitRate(long standardInputTokens, long cachedInputTokens) {
        long totalInputTokens = standardInputTokens + cachedInputTokens;
        if (totalInputTokens == 0) {
            return 0.0;
        }

        return cachedInputTokens * 100.0 / totalInputTokens;
    }

        static long tokensSaved(long sourceTokens, long compactedTokens) {
                return Math.max(sourceTokens - compactedTokens, 0);
        }

        static double tokenReductionRate(long sourceTokens, long compactedTokens) {
                if (sourceTokens == 0) {
                        return 0.0;
                }

                return tokensSaved(sourceTokens, compactedTokens) * 100.0 / sourceTokens;
        }

    record InstantDemoResult(
            String model,
            String prompt,
            String response,
            UsageSummary usage,
            CacheSummary cache,
            CostSummary cost,
            PricingSummary pricing,
            List<InstantPriceComparison> comparisons) {
    }

    record InstantPriceComparison(
            String id,
            String label,
            String note,
            String inputRateValue,
            String cachedInputRateValue,
            String outputRateValue,
            String callCost,
            String multiplier) {
    }

    record PromptCacheDemoResult(
            String model,
            String cacheKey,
            int promptCharacters,
            int referenceSections,
            String promptPreview,
            PricingSummary pricing,
            List<CallSummary> calls) {
    }

    record CompactDemoResult(
            String model,
            String prompt,
            String compactedPrompt,
            int sourceCharacters,
            int compactedCharacters,
            UsageSummary usage,
            CompactionSummary compaction,
            CostSummary cost,
            PricingSummary pricing) {
    }

    record CavemanDemoResult(
            String model,
            String prompt,
            String normalResponse,
            String cavemanResponse,
            UsageSummary normalUsage,
            UsageSummary cavemanUsage,
            CavemanSummary caveman,
            CostSummary normalCost,
            CostSummary cavemanCost,
            String outputCostSaved,
            PricingSummary pricing) {
    }

    record CavemanSummary(long normalOutputTokens, long cavemanOutputTokens, long tokensSaved, double tokenReductionRate) {
    }

    record CallSummary(
            String label,
            String response,
            UsageSummary usage,
            CacheSummary cache,
            CostSummary cost) {
    }

    record UsageSummary(long inputTokens, long outputTokens, long totalTokens) {
    }

    record CacheSummary(long standardInputTokens, long cachedInputTokens, double cacheHitRate) {
    }

        record CompactionSummary(long sourceTokens, long compactedTokens, long tokensSaved, double tokenReductionRate) {
        }

    record CostSummary(
            String currencyCode,
            String standardInput,
            String cachedInput,
            String output,
            String total,
            String cacheSavings) {
    }

    record PricingSummary(
            String model,
            String meterPrefix,
            String region,
            String scope,
            String retrievedAt,
            String currencyCode,
            String unitOfMeasure,
            String inputRate,
            String cachedInputRate,
            String outputRate,
            String inputRateValue,
            String cachedInputRateValue,
            String outputRateValue,
            String inputMeter,
            String cachedInputMeter,
            String outputMeter) {
    }
}