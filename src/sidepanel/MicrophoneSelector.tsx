import { useState, useEffect } from "preact/hooks";

/** Microphone selector with permission request flow. */
export function MicrophoneSelector({
  deviceId,
  onChange,
}: {
  deviceId?: string;
  onChange: (deviceId: string | undefined) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function loadDevices() {
    setLoading(true);
    setError(null);
    try {
      // Side panel can't call getUserMedia — request via background/extension tab
      const response = await chrome.runtime.sendMessage({
        type: "REQUEST_MIC_PERMISSION",
      });

      if (!response?.ok) {
        const msg = response?.error ?? "Unknown error";
        if (
          msg.includes("NotAllowed") ||
          msg.toLowerCase().includes("denied") ||
          msg.toLowerCase().includes("permission")
        ) {
          setError(
            "Microphone permission denied. Allow microphone access in your browser settings for this extension, then try again.",
          );
        } else {
          setError(`Microphone error: ${msg}`);
        }
        return;
      }

      setDevices(
        (response.devices ?? []).map(
          (d: { deviceId: string; label: string }) =>
            ({ deviceId: d.deviceId, label: d.label }) as MediaDeviceInfo,
        ),
      );
      setLoaded(true);
    } catch (err) {
      setError(`Microphone error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
  }, []);

  if (loading) {
    return <div class="text-xs text-gray-500">Requesting microphone access...</div>;
  }

  if (error) {
    return (
      <div class="space-y-1">
        <div class="text-xs text-amber-600">{error}</div>
        <button onClick={loadDevices} class="text-xs text-blue-600 hover:text-blue-700">
          Retry
        </button>
      </div>
    );
  }

  if (!loaded) return null;

  return (
    <select
      value={deviceId ?? ""}
      onChange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        onChange(val || undefined);
      }}
      class="border rounded px-2 py-1.5 text-sm w-full"
    >
      <option value="">System default</option>
      {devices.map((d) => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || `Microphone (${d.deviceId.substring(0, 8)}...)`}
        </option>
      ))}
    </select>
  );
}
