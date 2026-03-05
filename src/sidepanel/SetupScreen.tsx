import { useState, useEffect } from "preact/hooks";
import { getSettings, saveSettings } from "@/shared/settings";
import { MicrophoneSelector } from "./MicrophoneSelector";

/** Setup screen for configuring backend URL. */
export function SetupScreen({ onComplete }: { onComplete: () => void }) {
  const [backendUrl, setBackendUrl] = useState("http://localhost:8900");
  const [micDeviceId, setMicDeviceId] = useState<string | undefined>();
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setBackendUrl(s.backend_url);
      setMicDeviceId(s.microphone_device_id);
    });
  }, []);

  async function handleSave() {
    setTesting(true);
    setError(null);

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

    await saveSettings({
      backend_url: backendUrl,
      microphone_device_id: micDeviceId,
    });
    setTesting(false);
    onComplete();
  }

  return (
    <div class="flex flex-col h-screen p-4">
      <h1 class="text-lg font-bold mb-1">Ancroo Setup</h1>
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
        onClick={handleSave}
        disabled={testing}
        class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
      >
        {testing ? "Testing connection..." : "Connect"}
      </button>
    </div>
  );
}
