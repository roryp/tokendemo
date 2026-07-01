# AGENTS.md

Guidance for coding agents working in this repository.

## Repository Purpose

This is a Java 21 Spring Boot sample for Microsoft Foundry instant models. It shows how to call instant models, display token usage, demonstrate prompt caching, compact long working notes, compress an answer into terse "caveman speak" to cut output tokens, estimate cost from live Azure Retail Prices API meters, and deploy the dashboard to Azure Container Apps with azd.

## Important Files

- `pom.xml` - Maven and Spring Boot configuration.
- `azure.yaml` - azd service definition. The `web` service must remain a standard `containerapp` service using local Docker build.
- `Dockerfile` - Container build for the Spring Boot app.
- `infra/*.bicep` - Foundry, ACR, Container Apps, managed identity, and RBAC resources.
- `src/main/java/com/example/instantmodels/` - CLI app, Spring Boot app, pricing client, and demo logic.
- `src/main/resources/static/` - Web dashboard.
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
- The web app and CLI share the same pricing and usage concepts.
- Prompt caching demo intentionally uses a long stable prefix and a fresh cache key per run.

## Coding Guidance

- Keep token efficiency visible and measurable.
- Keep pricing estimates based on live Retail Prices API calls.
- Prefer configuration via env vars / `.env.example` over hardcoded deployment-specific values.
- Keep README examples generic; do not include real provisioned endpoint names.
- If a model-meter mapping changes, update configuration/mapping in code and README together.

## Validation Expectations

- Always run `mvn test` after Java or Maven changes.
- Run `az bicep build --file infra/main.bicep --stdout` after Bicep changes.
- Use Playwright/browser testing for UI changes when possible.
- Verify live Azure deployment changes with `azd up` or `azd deploy web`.