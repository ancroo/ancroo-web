import { useState, useEffect } from "preact/hooks";
import {
  getSettings,
  saveSettings,
  type ConnectionMode,
  type LLMProviderConfig,
} from "@/shared/settings";
import { seedStarterWorkflows } from "@/shared/local-workflows";
import { fetchModels } from "@/shared/llm/models";
import { ensureHostPermission } from "@/shared/host-permission";
import { MicrophoneSelector } from "./MicrophoneSelector";
import { ProviderSettings, DEFAULT_MODELS } from "./ProviderSettings";

/** Setup screen — mode selection, then mode-specific configuration. */
export function SetupScreen({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<"mode" | "backend" | "direct">("mode");

  // Backend state
  const [backendUrl, setBackendUrl] = useState("http://localhost:8900");
  const [micDeviceId, setMicDeviceId] = useState<string | undefined>();
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct state
  const [providers, setProviders] = useState<LLMProviderConfig[]>([]);

  useEffect(() => {
    getSettings().then((s) => {
      setBackendUrl(s.backend_url);
      setMicDeviceId(s.microphone_device_id);
      setProviders(s.llm_providers);
    });
  }, []);

  async function handleSelectMode(mode: ConnectionMode) {
    const current = await getSettings();
    await saveSettings({ ...current, connection_mode: mode });
    setStep(mode === "backend" ? "backend" : "direct");
    setError(null);
  }

  async function handleBackendSave() {
    setTesting(true);
    setError(null);

    const granted = await ensureHostPermission(backendUrl);
    if (!granted) {
      setError("Permission to access the backend URL was denied.");
      setTesting(false);
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/health`);
      if (!res.ok) {
        setError(`Backend returned ${res.status}`);
        setTesting(false);
        return;
      }
    } catch {
      setError("Cannot reach backend. Is the server running?");
      setTesting(false);
      return;
    }

    const current = await getSettings();
    await saveSettings({
      ...current,
      connection_mode: "backend",
      backend_url: backendUrl,
      microphone_device_id: micDeviceId,
    });
    setTesting(false);
    onComplete();
  }

  async function handleDirectSaveProviders(updated: LLMProviderConfig[]) {
    setProviders(updated);
    const current = await getSettings();
    await saveSettings({ ...current, llm_providers: updated });
  }

  async function handleDirectComplete() {
    if (providers.length === 0) {
      setError("Add at least one LLM provider to continue.");
      return;
    }
    setError(null);
    const current = await getSettings();
    await saveSettings({ ...current, connection_mode: "direct", llm_providers: providers });

    // Seed starter workflows — try to detect the first available model
    const firstProvider = providers[0];
    let defaultModel = DEFAULT_MODELS[firstProvider.type] || "gpt-4o";
    try {
      const models = await fetchModels(firstProvider);
      if (models.length > 0) {
        defaultModel = models[0].id;
      }
    } catch {
      // Fall back to hardcoded default
    }
    await seedStarterWorkflows(firstProvider.id, defaultModel);

    onComplete();
  }

  // Step 1: Mode selection
  if (step === "mode") {
    return (
      <div class="flex flex-col h-screen p-4">
        <h1 class="text-lg font-bold mb-1">Ancroo Setup</h1>
        <p class="text-xs text-gray-500 mb-6">
          How would you like to use Ancroo?
        </p>

        <div class="space-y-3">
          <button
            onClick={() => handleSelectMode("direct")}
            class="w-full text-left p-4 bg-white rounded-lg border-2 border-transparent hover:border-blue-300 hover:shadow-sm transition"
          >
            <div class="font-medium text-sm">Direct Mode</div>
            <p class="text-xs text-gray-500 mt-1">
              Connect directly to OpenAI, Anthropic, Gemini, Ollama, OpenRouter,
              or any OpenAI-compatible API. No server needed.
            </p>
          </button>

          <button
            onClick={() => handleSelectMode("backend")}
            class="w-full text-left p-4 bg-white rounded-lg border-2 border-transparent hover:border-blue-300 hover:shadow-sm transition"
          >
            <div class="font-medium text-sm">Backend Mode</div>
            <p class="text-xs text-gray-500 mt-1">
              Connect to a self-hosted Ancroo server. Includes STT, tools,
              n8n integration, and multi-user support.
            </p>
          </button>
        </div>
      </div>
    );
  }

  // Step 2a: Backend setup (existing flow)
  if (step === "backend") {
    return (
      <div class="flex flex-col h-screen p-4">
        <h1 class="text-lg font-bold mb-1">Backend Setup</h1>
        <p class="text-xs text-gray-500 mb-4">
          Configure your server and microphone.
        </p>

        <label class="text-xs font-medium text-gray-700 mb-1">Backend URL</label>
        <input
          type="url"
          value={backendUrl}
          onInput={(e) => setBackendUrl((e.target as HTMLInputElement).value)}
          class="border rounded px-2 py-1.5 text-sm mb-3 w-full"
          placeholder="http://localhost:8900"
        />

        <label class="text-xs font-medium text-gray-700 mb-1">Microphone</label>
        <div class="mb-3">
          <MicrophoneSelector
            deviceId={micDeviceId}
            onChange={setMicDeviceId}
          />
        </div>

        {error && (
          <div class="text-xs text-red-600 mb-3">{error}</div>
        )}

        <button
          onClick={handleBackendSave}
          disabled={testing}
          class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
        >
          {testing ? "Testing connection..." : "Connect"}
        </button>

        <button
          onClick={() => { setStep("mode"); setError(null); }}
          class="mt-3 text-xs text-gray-400 hover:text-gray-600 text-center"
        >
          Back
        </button>
      </div>
    );
  }

  // Step 2b: Direct Mode setup
  return (
    <div class="flex flex-col h-screen p-4">
      <h1 class="text-lg font-bold mb-1">Direct Mode Setup</h1>
      <p class="text-xs text-gray-500 mb-4">
        Add at least one LLM provider to get started.
        Starter workflows will be created automatically.
      </p>

      <div class="flex-1 overflow-y-auto">
        <ProviderSettings
          providers={providers}
          onSave={handleDirectSaveProviders}
        />
      </div>

      {error && (
        <div class="text-xs text-red-600 mt-3">{error}</div>
      )}

      <button
        onClick={handleDirectComplete}
        disabled={providers.length === 0}
        class="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
      >
        Complete Setup
      </button>

      <button
        onClick={() => { setStep("mode"); setError(null); }}
        class="mt-2 text-xs text-gray-400 hover:text-gray-600 text-center"
      >
        Back
      </button>
    </div>
  );
}
