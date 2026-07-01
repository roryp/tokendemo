# Copilot Instructions

This repository is a Java 21 / Spring Boot sample for Microsoft Foundry instant models. It demonstrates token usage, prompt caching, live Azure Retail Prices API lookup, and Azure Container Apps deployment through azd.

## Project Priorities

- Keep token efficiency central. Prefer small, scoped prompts and direct Responses API calls unless an agent/tool workflow is explicitly needed.
- Preserve the demo's cost transparency: input tokens, output tokens, cached input tokens, retail meters, and estimated cost should stay visible in CLI and web flows.
- Treat `.env` and `.azure/` as local-only. Never commit real Foundry endpoints, API keys, access tokens, or generated azd environment files.
- Prefer Microsoft Entra authentication through `DefaultAzureCredential`. Do not add API-key auth paths unless explicitly requested.

## Build And Runtime

- Java target is 21.
- Maven is the build system.
- Spring Boot web dashboard entry point is `com.example.instantmodels.InstantModelsWebApplication`.
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
- Bicep provisions Foundry, ACR, Container Apps, Log Analytics, and managed identity/RBAC.
- The Container App managed identity needs:
  - AcrPull on the container registry.
  - Azure AI User on the Foundry project.
- If changing infrastructure, validate with:
  - `az bicep build --file infra/main.bicep --stdout`

## Pricing And Models

- The live pricing lookup uses Azure Retail Prices API.
- `gpt-chat-latest` and the tested `gpt-5.5` path currently resolve to `5.5 ShortCo` pricing in this app.
- Do not hardcode one-off prices without also keeping runtime pricing lookup intact.
- If model aliases change, prefer making meter-prefix mapping configurable rather than baking assumptions into UI text.

## Frontend Guidance

- The dashboard is a compact operational tool, not a marketing page.
- Keep the UI colorful but information-dense and readable.
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
- For deployment changes, verify `azd up` or `azd deploy web` rather than manual `az acr build` / `az containerapp update` commands.
- Run a commit-candidate secret scan when touching config, README, or deployment files.