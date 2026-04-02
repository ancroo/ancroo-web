/** Extension settings stored in chrome.storage.local. */

export type ConnectionMode = "backend" | "direct";

export type LLMProviderType =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "openrouter"
  | "openai-compatible";

export interface LLMProviderConfig {
  id: string;
  type: LLMProviderType;
  name: string;
  api_key: string;
  /** Base URL for openai-compatible providers. */
  base_url?: string;
}

export interface Settings {
  connection_mode: ConnectionMode;
  backend_url: string;
  microphone_device_id?: string;
  llm_providers: LLMProviderConfig[];
}

const DEFAULTS: Settings = {
  connection_mode: "backend",
  backend_url: "http://localhost:8900",
  llm_providers: [],
};

/** Get current settings (with defaults). */
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULTS, ...(stored.settings as Partial<Settings> | undefined) };
}

/** Save settings. */
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}

/** Check if initial setup has been completed. */
export async function isSetupComplete(): Promise<boolean> {
  const stored = await chrome.storage.local.get("settings");
  if (!stored.settings) return false;
  const settings = { ...DEFAULTS, ...stored.settings } as Settings;
  if (settings.connection_mode === "direct") {
    return settings.llm_providers.length > 0;
  }
  return true;
}
