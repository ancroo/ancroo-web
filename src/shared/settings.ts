/** Extension settings stored in chrome.storage.local. */

export interface Settings {
  backend_url: string;
  microphone_device_id?: string;
}

const DEFAULTS: Settings = {
  backend_url: "http://localhost:8900",
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
  return stored.settings !== undefined;
}
