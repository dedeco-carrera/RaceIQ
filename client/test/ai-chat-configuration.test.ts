import { describe, expect, test } from "bun:test";
import { aiReadiness, isAiAnalysisConfigured, isAiChatConfigured, isProviderConfigured } from "../src/lib/is-ai-configured";

describe("AI chat configuration", () => {
  test("accepts Codex with a selected model and no API key", () => {
    expect(isAiChatConfigured({ chatProvider: "codex", chatModel: "gpt-6-luna" })).toBe(true);
  });

  test("requires a model for Codex", () => {
    expect(isAiChatConfigured({ chatProvider: "codex", chatModel: "  " })).toBe(false);
  });

  test("continues to require API keys for hosted providers", () => {
    expect(isAiChatConfigured({ chatProvider: "openai", chatModel: "gpt-4o" })).toBe(false);
    expect(isAiChatConfigured({ chatProvider: "openai", chatModel: "gpt-4o", openaiApiKeySet: true })).toBe(true);
  });

  test("reports Codex availability and sign-in separately from missing models", () => {
    for (const state of ["not-signed-in", "cli-unavailable", "unsupported-runtime", "unavailable"] as const) {
      expect(aiReadiness("codex", "gpt-6-luna", {}, state)).toBe(state);
      expect(isProviderConfigured("codex", {}, state)).toBe(false);
    }
    expect(aiReadiness("codex", "", {}, "ready")).toBe("missing-model");
    expect(aiReadiness("codex", "gpt-6-luna", {}, "ready")).toBe("ready");
  });

  test("analysis and chat share provider rules", () => {
    expect(isAiAnalysisConfigured({ aiProvider: "codex", aiModel: "gpt-6-luna" })).toBe(true);
    expect(aiReadiness("openai-compatible", "local-model", {})).toBe("ready");
    expect(aiReadiness("", "model", {})).toBe("missing-provider");
  });
});
