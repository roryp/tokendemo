package com.example.instantmodels;

import com.openai.models.responses.Response;
import com.openai.models.responses.ResponseUsage;

import java.util.function.Supplier;

import org.springframework.stereotype.Component;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.metrics.DoubleCounter;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.LongHistogram;
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;

/**
 * Emits OpenTelemetry GenAI spans and token/cost metrics for each instant model call.
 *
 * <p>Spans follow the GenAI semantic conventions so they surface in the Microsoft Foundry
 * portal Traces and Monitoring views once an Application Insights resource is connected to
 * the project. Metrics land in Application Insights {@code customMetrics} for charting in
 * Azure Monitor Metrics Explorer. When no telemetry agent is attached (for example during
 * local runs or tests) {@link GlobalOpenTelemetry#get()} returns a no-op instance, so every
 * call here becomes a cheap no-op.
 */
@Component
class TokenTelemetry {
    static final String SCOPE_NAME = "com.example.instantmodels";
    private static final String GEN_AI_SYSTEM = "az.ai.openai";

    private static final AttributeKey<String> DEMO = AttributeKey.stringKey("im.demo");
    private static final AttributeKey<String> MODEL = AttributeKey.stringKey("im.model");
    private static final AttributeKey<String> CURRENCY = AttributeKey.stringKey("im.currency");
    private static final AttributeKey<String> IM_TOKEN_TYPE = AttributeKey.stringKey("im.token_type");
    private static final AttributeKey<String> GEN_AI_TOKEN_TYPE = AttributeKey.stringKey("gen_ai.token.type");
    private static final AttributeKey<String> GEN_AI_REQUEST_MODEL = AttributeKey.stringKey("gen_ai.request.model");

    private final Tracer tracer;
    private final LongHistogram tokenUsageHistogram;
    private final LongCounter tokenCounter;
    private final DoubleCounter costCounter;
    private final LongCounter callCounter;

    TokenTelemetry() {
        this(GlobalOpenTelemetry.get());
    }

    TokenTelemetry(OpenTelemetry openTelemetry) {
        this.tracer = openTelemetry.getTracer(SCOPE_NAME);
        Meter meter = openTelemetry.getMeter(SCOPE_NAME);
        this.tokenUsageHistogram = meter.histogramBuilder("gen_ai.client.token.usage")
                .setDescription("Tokens used per GenAI request, split by token type.")
                .setUnit("{token}")
                .ofLongs()
                .build();
        this.tokenCounter = meter.counterBuilder("instantmodels.tokens")
                .setDescription("Tokens processed by the instant models demo, split by token type.")
                .setUnit("{token}")
                .build();
        this.costCounter = meter.counterBuilder("instantmodels.cost_usd")
                .setDescription("Estimated cost from live Azure Retail Prices meters.")
                .setUnit("USD")
                .ofDoubles()
                .build();
        this.callCounter = meter.counterBuilder("instantmodels.model_calls")
                .setDescription("Instant model calls, split by demo.")
                .setUnit("{call}")
                .build();
    }

    /**
     * Runs {@code call} inside a GenAI client span and records token metrics from the response usage.
     */
    Response recordCall(String demo, String model, Supplier<Response> call) {
        Span span = tracer.spanBuilder("chat " + model)
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute("gen_ai.operation.name", "chat")
                .setAttribute("gen_ai.system", GEN_AI_SYSTEM)
                .setAttribute("gen_ai.request.model", model)
                .setAttribute(DEMO, demo)
                .startSpan();
        try (Scope scope = span.makeCurrent()) {
            Response response = call.get();
            recordUsage(span, demo, model, response);
            return response;
        } catch (RuntimeException ex) {
            span.setStatus(StatusCode.ERROR, ex.getClass().getSimpleName());
            span.recordException(ex);
            throw ex;
        } finally {
            span.end();
        }
    }

    /** Records the estimated call cost as a metric so spend trends are chartable next to tokens. */
    void recordCost(String demo, String model, String currency, double cost) {
        costCounter.add(cost, Attributes.of(DEMO, demo, MODEL, model, CURRENCY, currency));
    }

    private void recordUsage(Span span, String demo, String model, Response response) {
        callCounter.add(1, Attributes.of(DEMO, demo, MODEL, model));

        ResponseUsage usage = response.usage().orElse(null);
        if (usage == null) {
            return;
        }

        long input = usage.inputTokens();
        long output = usage.outputTokens();
        long total = usage.totalTokens();
        long cached = cachedInputTokens(usage);
        long standardInput = Math.max(input - cached, 0);

        span.setAttribute("gen_ai.usage.input_tokens", input);
        span.setAttribute("gen_ai.usage.output_tokens", output);
        span.setAttribute("gen_ai.usage.total_tokens", total);
        span.setAttribute("im.cached_input_tokens", cached);

        tokenUsageHistogram.record(input, tokenUsageAttrs(demo, model, "input"));
        tokenUsageHistogram.record(output, tokenUsageAttrs(demo, model, "output"));

        tokenCounter.add(input, imTokenAttrs(demo, model, "input"));
        tokenCounter.add(standardInput, imTokenAttrs(demo, model, "standard_input"));
        tokenCounter.add(cached, imTokenAttrs(demo, model, "cached_input"));
        tokenCounter.add(output, imTokenAttrs(demo, model, "output"));
        tokenCounter.add(total, imTokenAttrs(demo, model, "total"));
    }

    private static Attributes tokenUsageAttrs(String demo, String model, String tokenType) {
        return Attributes.of(GEN_AI_TOKEN_TYPE, tokenType, GEN_AI_REQUEST_MODEL, model, DEMO, demo);
    }

    private static Attributes imTokenAttrs(String demo, String model, String tokenType) {
        return Attributes.of(IM_TOKEN_TYPE, tokenType, MODEL, model, DEMO, demo);
    }

    private static long cachedInputTokens(ResponseUsage usage) {
        try {
            return usage.inputTokensDetails().cachedTokens();
        } catch (RuntimeException ex) {
            return 0;
        }
    }
}
