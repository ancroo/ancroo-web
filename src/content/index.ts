import type { ExtensionMessage } from "@/shared/messages";
import { matchesEvent, HOTKEY_STORAGE_KEY } from "@/shared/hotkeys";
import type { HotkeyBinding } from "@/shared/types";
import { smartInsertText } from "./text-inserter";

// --- Hotkey handling ---

let hotkeyBindings: HotkeyBinding[] = [];

// Load initial bindings from session storage.
// If empty, fall back to persistent local storage (survives browser restarts).
// If still empty, ask the background to refresh from the server.
// Wrapped in try-catch to gracefully handle orphaned content scripts
// ("Extension context invalidated" after extension reload).
try {
  chrome.storage.session.get(HOTKEY_STORAGE_KEY).then(async (data) => {
    hotkeyBindings = (data[HOTKEY_STORAGE_KEY] as HotkeyBinding[] | undefined) ?? [];
    if (hotkeyBindings.length === 0) {
      const local = await chrome.storage.local.get(HOTKEY_STORAGE_KEY);
      hotkeyBindings = (local[HOTKEY_STORAGE_KEY] as HotkeyBinding[] | undefined) ?? [];
      if (hotkeyBindings.length > 0) {
        await chrome.storage.session.set({ [HOTKEY_STORAGE_KEY]: hotkeyBindings });
      } else {
        chrome.runtime.sendMessage({ type: "REFRESH_HOTKEYS" });
      }
    }
  }).catch(() => {});
} catch {
  // Orphaned content script — silently ignore
}

// Stay in sync when background updates the bindings
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "session" && changes[HOTKEY_STORAGE_KEY]) {
    hotkeyBindings = (changes[HOTKEY_STORAGE_KEY].newValue as HotkeyBinding[]) ?? [];
  }
});

// Listen for keyboard shortcuts (capture phase to intercept before page handlers)
function hotkeyHandler(event: KeyboardEvent): void {
  // Skip if no modifier keys are pressed — all hotkeys require at least one
  if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
  if (hotkeyBindings.length === 0) return;

  for (const binding of hotkeyBindings) {
    if (matchesEvent(event, binding.parsed)) {
      event.preventDefault();
      event.stopPropagation();

      try {
        chrome.runtime.sendMessage({
          type: "EXECUTE_HOTKEY_WORKFLOW",
          workflowSlug: binding.workflow_slug,
          needsSidePanel: binding.needsSidePanel,
        });
      } catch {
        // "Extension context invalidated" — this content script is orphaned
        // after an extension reload.  Remove the listener so the freshly
        // injected script can handle hotkeys without interference.
        document.removeEventListener("keydown", hotkeyHandler, true);
      }
      return;
    }
  }
}
document.addEventListener("keydown", hotkeyHandler, true);

// Typed state for audio recording, shared between executeScript calls
// and this content script (both run in the same isolated world).
interface AncrooRecordingState {
  recorder?: MediaRecorder;
  stream?: MediaStream;
  chunks?: Blob[];
  mimeType?: string;
}

// Namespaced global to avoid polluting globalThis with multiple properties
const ANCROO_KEY = "__ancrooRecording";

function getRecordingState(): AncrooRecordingState {
  return ((globalThis as Record<string, unknown>)[ANCROO_KEY] as AncrooRecordingState) ?? {};
}

function clearRecordingState(): void {
  delete (globalThis as Record<string, unknown>)[ANCROO_KEY];
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    // Only accept messages from our own extension
    if (sender.id !== chrome.runtime.id) {
      return false;
    }

    if (message.type === "GET_SELECTION") {
      const selection = window.getSelection()?.toString() ?? "";
      sendResponse({
        type: "SELECTION_RESULT",
        text: selection,
        url: window.location.href,
        title: document.title,
      });
      return true;
    }

    if (message.type === "INSERT_TEXT") {
      smartInsertText(message.text).then((success) => {
        sendResponse({
          type: "INSERT_RESULT",
          success,
        });
      });
      return true; // keep channel open for async sendResponse
    }

    if (message.type === "GET_FORM_FIELDS") {
      const result: Record<string, string> = {};
      for (const field of message.fields) {
        try {
          const el = document.querySelector(field.selector);
          if (el) {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
              result[field.name] = el.value;
            } else {
              result[field.name] = el.textContent ?? "";
            }
          }
        } catch {
          continue;
        }
      }
      sendResponse({ type: "FORM_FIELDS_RESULT", fields: result });
      return true;
    }

    // Recording is started via chrome.scripting.executeScript from the side panel,
    // which stores MediaRecorder state in globalThis.__ancrooRecording (isolated world shared).
    if (message.type === "STOP_RECORDING") {
      const state = getRecordingState();

      if (!state.recorder || state.recorder.state === "inactive") {
        sendResponse({ success: false, error: "Not recording" });
        return true;
      }

      const { recorder, stream, chunks, mimeType } = state;
      const resolvedMimeType = mimeType ?? "audio/webm";

      recorder.onstop = async () => {
        const blob = new Blob(chunks ?? [], { type: resolvedMimeType });
        const arrayBuffer = await blob.arrayBuffer();
        stream?.getTracks().forEach((t) => t.stop());
        clearRecordingState();
        sendResponse({ success: true, audioData: arrayBuffer, mimeType: resolvedMimeType });
      };

      recorder.stop();
      return true; // keep channel open for async sendResponse
    }

    if (message.type === "CANCEL_RECORDING") {
      const state = getRecordingState();
      if (state.recorder && state.recorder.state !== "inactive") {
        state.recorder.stop();
      }
      state.stream?.getTracks().forEach((t) => t.stop());
      clearRecordingState();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === "SHOW_TOAST") {
      showToast(message.text, message.variant, message.duration);
      return false;
    }

    if (message.type === "HIDE_TOAST") {
      hideToast();
      return false;
    }

    return false;
  }
);

// --- Toast overlay for hotkey feedback ---

const TOAST_ID = "__ancroo-toast";
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(text: string, variant: "processing" | "success" | "error", duration?: number): void {
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = TOAST_ID;
    el.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "right:24px",
      "z-index:2147483647",
      "padding:10px 18px",
      "border-radius:8px",
      "font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif",
      "color:#fff",
      "box-shadow:0 4px 12px rgba(0,0,0,.25)",
      "pointer-events:none",
      "transition:opacity .2s",
      "opacity:0",
    ].join(";");
    document.documentElement.appendChild(el);
  }

  const colors = { processing: "#3b82f6", success: "#22c55e", error: "#ef4444" };
  el.style.background = colors[variant];

  const icons = { processing: "\u23F3", success: "\u2714", error: "\u2718" };
  el.textContent = `${icons[variant]}  ${text}`;

  // Force reflow then fade in
  void el.offsetWidth;
  el.style.opacity = "1";

  clearTimeout(toastTimer);
  if (duration && duration > 0) {
    toastTimer = setTimeout(hideToast, duration);
  }
}

function hideToast(): void {
  const el = document.getElementById(TOAST_ID);
  if (el) {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 200);
  }
  clearTimeout(toastTimer);
}
