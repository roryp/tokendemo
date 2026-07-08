# AGENTS.md

Guidance for coding agents working in this repository.

## Repository Purpose

This is a Java 21 Spring Boot sample for Microsoft Foundry instant models. It shows how to call instant models, display token usage, demonstrate prompt caching, compact long working notes, compress an answer into terse "caveman speak" to cut output tokens, estimate cost from live Azure Retail Prices API meters, and deploy a locked-down public dashboard to Azure Container Apps with azd.

## Important Files

- `pom.xml` - Maven and Spring Boot configuration.
- `azure.yaml` - azd service definition. The `web` service must remain a standard `containerapp` service using local Docker build.
- `Dockerfile` - Container build for the Spring Boot app.
- `infra/*.bicep` - Foundry, ACR, Container Apps, managed identity, and RBAC resources.
- `src/main/java/com/example/instantmodels/` - CLI app, Spring Boot app, pricing client, and demo logic.
- `src/main/resources/templates/` - Thymeleaf server-rendered dashboard.
- `src/main/resources/static/` - Dashboard CSS only. Do not reintroduce browser JavaScript for model calls.
- `.env.example` - Safe local configuration template.

## Do Not Commit

- `.env`
- `.azure/`
- `target/`
- `infra/main.json`
- real endpoints, API keys, tokens, or generated deployment output

## Development Commands

```powershell
mvn test
mvn spring-boot:run
mvn compile exec:java
mvn compile exec:java '-Dexec.mainClass=com.example.instantmodels.PromptCacheDemoApp'
```

For Azure:

```powershell
azd up
azd deploy web
azd down
```

The intended azd flow is local Docker build and push through azd. Avoid manual deployment commands unless debugging a failed azd operation.

## Architecture Notes

- Local auth uses `DefaultAzureCredential`, usually backed by `az login`.
- Azure Container Apps uses a user-assigned managed identity.
- The managed identity needs ACR pull and Foundry project access.
- The public web app is GET-only and server-rendered. It has no public `/api/*` model endpoints, forms, buttons, postback routes, or browser JavaScript.
- The web app and CLI share the same pricing and usage concepts, but executable custom/live measurements should use the CLI or direct Responses API path, not public web endpoints.
- Prompt caching demo intentionally uses a long stable prefix and a fresh cache key per run.
- Web demo results are fixed and cached in memory after the first render of an app instance; a restart or redeploy can repopulate that cache once.

## Coding Guidance

- Keep token efficiency visible and measurable.
- Keep pricing estimates based on live Retail Prices API calls.
- Keep the public dashboard non-interactive: no public model-call APIs, no action forms, no buttons, and no browser-side model calls.
- Prefer configuration via env vars / `.env.example` over hardcoded deployment-specific values.
- Keep README examples generic; do not include real provisioned endpoint names.
- If a model-meter mapping changes, update configuration/mapping in code and README together.

## Validation Expectations

- Always run `mvn test` after Java or Maven changes.
- Run `az bicep build --file infra/main.bicep --stdout` after Bicep changes.
- Use Playwright/browser testing for UI changes when possible.
- For dashboard security changes, verify the live page has zero scripts/forms/buttons/API targets, `GET /` returns 200, `POST /` returns 405, former `/api/*` routes return 404, and `/app.js` returns 404.
- Verify live Azure deployment changes with `azd up` or `azd deploy web`.