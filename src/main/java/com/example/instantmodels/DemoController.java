package com.example.instantmodels;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class DemoController {
    private final DemoRunService demoRunService;

    DemoController(DemoRunService demoRunService) {
        this.demoRunService = demoRunService;
    }

    @GetMapping("/config")
    ConfigResponse config() {
        return new ConfigResponse(
                InstantModelsConfig.model(),
                InstantModelsConfig.pricingRegion(),
                InstantModelsConfig.pricingScope(),
                InstantModelsConfig.pricingMeterPrefix());
    }

    @PostMapping("/instant")
    DemoRunService.InstantDemoResult instant(@RequestBody(required = false) InstantRequest request) {
        String prompt = request == null ? null : request.prompt();
        return demoRunService.runInstantDemo(prompt);
    }

    @PostMapping("/cache-demo")
    DemoRunService.PromptCacheDemoResult cacheDemo() {
        return demoRunService.runPromptCacheDemo();
    }

    @PostMapping("/compact-demo")
    DemoRunService.CompactDemoResult compactDemo(@RequestBody(required = false) CompactRequest request) {
        String prompt = request == null ? null : request.prompt();
        return demoRunService.runCompactDemo(prompt);
    }

    @PostMapping("/caveman-demo")
    DemoRunService.CavemanDemoResult cavemanDemo(@RequestBody(required = false) CavemanRequest request) {
        String prompt = request == null ? null : request.prompt();
        return demoRunService.runCavemanDemo(prompt);
    }

    @ExceptionHandler(RuntimeException.class)
    ResponseEntity<ApiError> handleRuntimeException(RuntimeException ex) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body(new ApiError(ex.getClass().getSimpleName(), ex.getMessage()));
    }

    record InstantRequest(String prompt) {
    }

    record CompactRequest(String prompt) {
    }

    record CavemanRequest(String prompt) {
    }

    record ConfigResponse(String model, String pricingRegion, String pricingScope, String pricingMeterPrefix) {
    }

    record ApiError(String type, String message) {
    }
}