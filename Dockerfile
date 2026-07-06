FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /workspace

COPY pom.xml .
COPY src ./src
RUN mvn -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app

COPY --from=build /workspace/target/instantmodels-1.0.0-SNAPSHOT.jar app.jar
COPY --from=build /workspace/target/agent/applicationinsights-agent.jar applicationinsights-agent.jar

ENV PORT=8080
EXPOSE 8080

# The Application Insights Java agent auto-instruments HTTP + exports the custom GenAI
# token/cost telemetry emitted via the OpenTelemetry API. It reads
# APPLICATIONINSIGHTS_CONNECTION_STRING from the environment; if unset it disables itself.
ENTRYPOINT ["java", "-javaagent:/app/applicationinsights-agent.jar", "-jar", "/app/app.jar"]