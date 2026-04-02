import { useState, useEffect } from "preact/hooks";
import { getSettings, saveSettings, type LLMProviderConfig } from "@/shared/settings";
import { ProviderSettings } from "./ProviderSettings";

interface Props {
  onClose: () => void;
  onSwitchToBackend: () => void;
}

/** Settings screen for Direct Mode (provider management + mode switch). */
export function DirectModeSettings({ onClose, onSwitchToBackend }: Props) {
  const [providers, setProviders] = useState<LLMProviderConfig[]>([]);

  useEffect(() => {
    getSettings().then((s) => setProviders(s.llm_providers));
  }, []);

  async function handleSaveProviders(updated: LLMProviderConfig[]) {
    setProviders(updated);
    const current = await getSettings();
    await saveSettings({ ...current, llm_providers: updated });
  }

  return (
    <div class="flex flex-col h-screen">
      <div class="flex items-center justify-between p-3 border-b bg-white">
        <h1 class="font-bold text-sm">Direct Mode Settings</h1>
        <button onClick={onClose} class="text-xs text-gray-400 hover:text-gray-600">
          Close
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-4">
        <ProviderSettings providers={providers} onSave={handleSaveProviders} />

        <div class="pt-2 border-t">
          <p class="text-xs text-gray-400 mb-2">
            Switch to Backend Mode to use a self-hosted Ancroo server with
            STT, tools, and multi-user support.
          </p>
          <button
            onClick={onSwitchToBackend}
            class="w-full border rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50 transition"
          >
            Switch to Backend Mode
          </button>
        </div>
      </div>
    </div>
  );
}
