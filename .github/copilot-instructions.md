# Copilot Instructions

This repository is a Java 21 / Spring Boot sample for Microsoft Foundry instant models. It demonstrates token usage, prompt caching, live Azure Retail Prices API lookup, OpenTelemetry-based token/cost telemetry, and Azure Container Apps deployment through azd. The public web dashboard is GET-only, server-rendered with Thymeleaf, and intentionally exposes no public model-call APIs or action forms.

## Project Priorities

- Keep token efficiency central. Prefer small, scoped prompts and direct Responses API calls unless an agent/tool workflow is explicitly needed.
- Preserve the demo's cost transparency: input tokens, output tokens, cached input tokens, retail meters, and estimated cost should stay visible in CLI output and the server-rendered web dashboard.
- Keep the public dashboard locked down. Do not reintroduce `/api/*` demo endpoints, browser JavaScript model calls, action forms, buttons, or public postback routes without explicit approval and abuse controls.
- Treat `.env` and `.azure/` as local-only. Never commit real Foundry endpoints, API keys, access tokens, or generated azd environment files.
- Prefer Microsoft Entra authentication through `DefaultAzureCredential`. Do not add API-key auth paths unless explicitly requested.

## Build And Runtime

- Java target is 21.
- Maven is the build system.
- Spring Boot web dashboard entry point is `com.example.instantmodels.InstantModelsWebApplication`.
- Web dashboard route is `GET /` only through `DemoController`; it renders fixed cached demo results with Thymeleaf.
- CLI entry points are:
  - `com.example.instantmodels.InstantModelsApp`
  - `com.example.instantmodels.PromptCacheDemoApp`
- Use `mvn test` for normal validation.
- Use `mvn spring-boot:run` for local web testing.
- Use `azd up` for full provision/build/push/deploy.
- Use `azd deploy web` for code-only Container App updates.

## Azure And azd

- Keep `azure.yaml` as a standard azd Container Apps service using local Docker build. Do not reintroduce ACR remote build.
- The Container App is discovered by azd via the `azd-service-name: web` tag in Bicep.
- Bicep provisions Foundry, ACR, Container Apps, Log Analytics, Application Insights, and managed identity/RBAC.
- The Container App managed identity needs:
  - AcrPull on the container registry.
  - Azure AI User on the Foundry project.
- Keep the Container App's `configuration.registries` (ACR login server + managed identity) in Bicep. azd injects it on first deploy, but re-running `azd up` re-applies Bicep and wipes it; without it, image pulls fail with `UNAUTHORIZED`.
- If changing infrastructure, validate with:
  - `az bicep build --file infra/main.bicep --stdout`

## Pricing And Models

- The live pricing lookup uses Azure Retail Prices API.
- `gpt-chat-latest` and the tested `gpt-5.5` path currently resolve to `5.5 ShortCo` pricing in this app.
- Do not hardcode one-off prices without also keeping runtime pricing lookup intact.
- If model aliases change, prefer making meter-prefix mapping configurable rather than baking assumptions into UI text.

## Observability

- The app emits OpenTelemetry GenAI spans and token/cost metrics from `TokenTelemetry` on every model call. Keep token and cost attributes visible on these signals.
- Use the OpenTelemetry API only (`io.opentelemetry:opentelemetry-api`, no explicit version so Spring Boot manages it). Do not add the OpenTelemetry SDK; export is the agent's job.
- The Application Insights Java agent is the export pipeline. Pin it via the `maven-dependency-plugin` `copy` goal (not a `<dependency>`) and attach it with `-javaagent` in the Dockerfile.
- The agent reads `APPLICATIONINSIGHTS_CONNECTION_STRING` and no-ops when unset, so local runs and tests stay agent-free. Do not require telemetry config for local builds.
- Bicep provisions a workspace-based Application Insights resource and an `AppInsights` connection on the Foundry project. Do not output the connection string from Bicep.

## Frontend Guidance

- The dashboard is a compact operational tool, not a marketing page.
- Keep the UI colorful but information-dense and readable.
- Keep the public UI non-interactive: no demo buttons/forms, no browser-side `fetch`, and no static `app.js` model-call flow.
- Preserve all four flows:
  - Instant demo for a small prompt.
  - Prompt cache demo for a long repeated prefix.
  - Compaction demo for condensing long working notes into a shorter durable summary.
  - Caveman speak demo for compressing an answer into terse fragments while keeping facts and code exact.
- Ensure text and metric cards remain readable on narrow screens.

## Validation Checklist

Before considering changes complete:

- Run `mvn test`.
- Run Bicep validation if infra changed.
- For UI changes, run locally and verify in browser/Playwright when possible.
- For dashboard security changes, verify zero scripts/forms/buttons/API targets in the DOM; `GET /` is 200; `POST /` is 405; former `/api/*` routes and `/app.js` are 404.
- For deployment changes, verify `azd up` or `azd deploy web` rather than manual `az acr build` / `az containerapp update` commands.
- Run a commit-candidate secret scan when touching config, README, or deployment files.