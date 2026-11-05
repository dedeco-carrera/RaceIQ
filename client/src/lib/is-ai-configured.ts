type AiProvider = "" | "gemini" | "openai" | "anthropic" | "openai-compatible" | "codex";

export interface AiConfigSettings {
  aiProvider?: AiProvider;
  geminiApiKeySet?: boolean;
  aiModel?: string;
  openaiApiKeySet?: boolean;
  anthropicApiKeySet?: boolean;
  chatProvider?: AiProvider;
  chatModel?: string;
}

export type CodexState = "ready" | "cli-unavailable" | "unsupported-runtime" | "not-signed-in" | "unavailable";
export type AiReadiness = "ready" | "missing-provider" | "missing-key" | "missing-model" | CodexState;

export function isProviderConfigured(provider: string, settings: AiConfigSettings, codexState?: CodexState): boolean {
  if (provider === "codex") return codexState === undefined || codexState === "ready";
  if (provider === "openai-compatible") return true;
  if (provider === "openai") return !!settings.openaiApiKeySet;
  if (provider === "anthropic") return !!settings.anthropicApiKeySet;
  if (provider === "gemini") return !!settings.geminiApiKeySet;
  return false;
}

export function aiReadiness(provider: string, model: string | undefined, settings: AiConfigSettings, codexState?: CodexState): AiReadiness {
  if (!provider) return "missing-provider";
  if (provider === "codex" && codexState && codexState !== "ready") return codexState;
  if (!isProviderConfigured(provider, settings, codexState)) return "missing-key";
  if (!model?.trim()) return "missing-model";
  return "ready";
}

export function isAiConfigured(settings: AiConfigSettings): boolean {
  if (settings.aiProvider === "codex") return aiReadiness(settings.aiProvider, settings.aiModel, settings) === "ready";
  return isProviderConfigured(settings.aiProvider ?? "", settings);
}

export function isAiAnalysisConfigured(settings: AiConfigSettings): boolean {
  return aiReadiness(settings.aiProvider ?? "", settings.aiModel, settings) === "ready";
}
export function isAiChatConfigured(settings: AiConfigSettings): boolean {
  return aiReadiness(settings.chatProvider ?? "", settings.chatModel, settings) === "ready";
}

export function launchAiFeature(aiConfigured: boolean, openFeature: () => void, configureAi: () => void): void {
  if (aiConfigured) {
    openFeature();
    return;
  }
  configureAi();
}
