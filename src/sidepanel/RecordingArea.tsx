import { useState, useEffect, useRef } from "preact/hooks";

interface RecordingAreaProps {
  onRecordingComplete: (file: File) => void;
  onError: (error: string) => void;
  autoStart?: boolean;
  deviceId?: string;
  /** Incremented by parent to request stopping the active recording (hotkey toggle). */
  stopSignal?: number;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function RecordingArea({
  onRecordingComplete,
  onError,
  autoStart,
  deviceId,
  stopSignal,
}: RecordingAreaProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopStream();
    };
  }, []);

  // Auto-start recording when triggered via hotkey OR when mic permission
  // is already granted (so the user doesn't have to click "Start Recording"
  // every time after the initial permission grant).
  useEffect(() => {
    if (autoStart) {
      handleStart();
    } else {
      // Check if mic permission is already granted — if so, start immediately
      navigator.permissions
        ?.query({ name: "microphone" as PermissionName })
        .then((status) => {
          if (status.state === "granted") {
            handleStart();
          }
        })
        .catch(() => {
          // permissions API not available — show button as fallback
        });
    }
  }, [autoStart]);

  // Stop recording when parent sends a stop signal (hotkey toggle)
  useEffect(() => {
    if (stopSignal && stopSignal > 0 && recorderRef.current?.state === "recording") {
      handleStop();
    }
  }, [stopSignal]);

  function stopStream() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    streamRef.current = null;
  }

  async function handleStart() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const chunks: Blob[] = [];
      chunksRef.current = chunks;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1000) {
          onError("Recording too short or empty. Please try again.");
          return;
        }
        const ext = mimeType.includes("webm") ? "webm" : "ogg";
        const file = new File([blob], `recording.${ext}`, { type: mimeType });
        onRecordingComplete(file);
      };

      recorder.start(250);

      setRecording(true);
      startTimeRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsed(Date.now() - startTimeRef.current);
      }, 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("NotAllowed") ||
        msg.toLowerCase().includes("denied") ||
        msg.toLowerCase().includes("permission")
      ) {
        setMicError(
          "Microphone access denied. Check your browser's site settings to allow microphone access for this extension."
        );
      } else if (msg.includes("NotFound") || msg.includes("no device")) {
        setMicError("No microphone found. Please connect a microphone.");
      } else {
        onError(`Microphone error: ${msg}`);
      }
    }
  }

  function handleStop() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setElapsed(0);

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop(); // triggers onstop → onRecordingComplete
    } else {
      onError("Not recording");
    }
  }

  if (micError) {
    return (
      <div class="py-3 space-y-2">
        <div class="text-sm text-amber-600 text-center">{micError}</div>
        <button
          onClick={() => {
            setMicError(null);
          }}
          class="w-full bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition text-xs"
        >
          Try again
        </button>
      </div>
    );
  }

  if (recording) {
    return (
      <div class="text-center py-4">
        <div class="flex items-center justify-center gap-2 mb-2">
          <span class="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <span class="text-sm font-medium text-red-600">Recording</span>
        </div>
        <div class="text-2xl font-mono text-gray-700 mb-3">
          {formatTime(elapsed)}
        </div>
        <button
          onClick={handleStop}
          class="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition text-sm"
        >
          Stop Recording
        </button>
      </div>
    );
  }

  return (
    <div class="text-center py-4">
      <button
        onClick={handleStart}
        class="text-white px-6 py-2 rounded-lg transition text-sm bg-blue-600 hover:bg-blue-700"
      >
        Start Recording
      </button>
      <div class="text-xs text-gray-400 mt-2">
        Or use Alt+Shift+R to toggle
      </div>
    </div>
  );
}
