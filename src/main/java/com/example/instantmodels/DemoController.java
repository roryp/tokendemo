package com.example.instantmodels;

import java.util.function.Supplier;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
class DemoController {
    private final DemoRunService demoRunService;
    private DemoRunService.InstantDemoResult instantResult;
    private DemoRunService.PromptCacheDemoResult cacheResult;
    private DemoRunService.CompactDemoResult compactResult;
    private DemoRunService.CavemanDemoResult cavemanResult;

    DemoController(DemoRunService demoRunService) {
        this.demoRunService = demoRunService;
    }

    @GetMapping("/")
    String index(Model model) {
        populateBaseModel(model);
        return "index";
    }

    @PostMapping("/")
    String runDemo(@RequestParam String demo, Model model) {
        populateBaseModel(model);
        try {
            switch (demo) {
                case "instant" -> model.addAttribute("instant", instantResult());
                case "cache" -> model.addAttribute("cache", cacheResult());
                case "compact" -> model.addAttribute("compact", compactResult());
                case "caveman" -> model.addAttribute("caveman", cavemanResult());
                default -> model.addAttribute("error", "Unknown demo: " + demo);
            }
        } catch (RuntimeException ex) {
            model.addAttribute("error", ex.getClass().getSimpleName() + ": " + ex.getMessage());
        }

        model.addAttribute("activeDemo", demo);
        return "index";
    }

    private void populateBaseModel(Model model) {
        model.addAttribute("modelValue", InstantModelsConfig.model());
        model.addAttribute("meterValue", InstantModelsConfig.pricingMeterPrefix());
        model.addAttribute("regionValue", InstantModelsConfig.pricingRegion() + " / " + InstantModelsConfig.pricingScope());
        model.addAttribute("instantPrompt", InstantModelsConfig.prompt());
        model.addAttribute("compactPrompt", DemoRunService.defaultCompactPrompt());
        model.addAttribute("cavemanPrompt", DemoRunService.defaultCavemanPrompt());
        model.addAttribute("instant", instantResult);
        model.addAttribute("cache", cacheResult);
        model.addAttribute("compact", compactResult);
        model.addAttribute("caveman", cavemanResult);
    }

    private synchronized DemoRunService.InstantDemoResult instantResult() {
        instantResult = cached(instantResult, demoRunService::runInstantDemo);
        return instantResult;
    }

    private synchronized DemoRunService.PromptCacheDemoResult cacheResult() {
        cacheResult = cached(cacheResult, demoRunService::runPromptCacheDemo);
        return cacheResult;
    }

    private synchronized DemoRunService.CompactDemoResult compactResult() {
        compactResult = cached(compactResult, demoRunService::runCompactDemo);
        return compactResult;
    }

    private synchronized DemoRunService.CavemanDemoResult cavemanResult() {
        cavemanResult = cached(cavemanResult, demoRunService::runCavemanDemo);
        return cavemanResult;
    }

    private static <T> T cached(T current, Supplier<T> supplier) {
        return current == null ? supplier.get() : current;
    }
}