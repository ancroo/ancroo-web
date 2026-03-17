import { executeWorkflow, listWorkflows, fetchHotkeySettings } from "@/shared/api-client";
import { sendToTab } from "@/shared/tab-messaging";
import { buildHotkeyBindings, HOTKEY_STORAGE_KEY } from "@/shared/hotkeys";
import type { ExtensionMessage, SelectionResultMessage } from "@/shared/messages";
import type { Workflow, HistoryEntry, HotkeyBinding } from "@/shared/types";

// Allow content scripts to read chrome.storage.session (required for hotkey bindings)
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

// --- Microphone permission via extension tab ---

// Chrome requires a real user gesture (click) to show the mic permission dialog.
// Side panels, offscreen docs, and auto-executing pages all fail with "Permission dismissed".
// Solution: open an extension page in a new tab with a button the user clicks.

let micResolve: ((value: unknown) => void) | null = null;

let micTabId: number | null = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) return false;

  if (msg.type === "MIC_PERMISSION_RESULT") {
    if (micResolve) {
      micResolve(msg);
      micResolve = null;
    }
    // Close the permission tab — window.close() doesn't work for extension tabs
    if (micTabId !== null) {
      chrome.tabs.remove(micTabId).catch(() => {});
      micTabId = null;
    }
    return false;
  }

  if (msg.type === "REQUEST_MIC_PERMISSION") {
    (async () => {
      try {
        const resultPromise = new Promise((resolve) => {
          micResolve = resolve;
          setTimeout(() => {
            if (micResolve === resolve) {
              micResolve = null;
              resolve({ ok: false, error: "Microphone permission request timed out" });
            }
          }, 60000);
        });

        // Open extension page in a new tab — the user clicks a button there
        // which triggers getUserMedia() with a real user gesture.
        const tab = await chrome.tabs.create({
          url: chrome.runtime.getURL("request-mic.html"),
          active: true,
        });
        micTabId = tab.id ?? null;

        const result = await resultPromise;
        sendResponse(result);
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return true;
  }

  // --- Content script detected a hotkey press ---
  if (msg.type === "EXECUTE_HOTKEY_WORKFLOW") {
    // Open side panel SYNCHRONOUSLY while the user-gesture context is still
    // available.  After any `await` Chrome no longer considers this user-initiated
    // and chrome.sidePanel.open() silently fails.
    if (msg.needsSidePanel && sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    }
    handleHotkeyExecution(msg.workflowSlug, sender.tab).catch((err) => {
      console.error("Hotkey workflow execution failed:", err);
    });
    return false;
  }

  // --- Side panel loaded workflows, refresh the hotkey map ---
  if (msg.type === "REFRESH_HOTKEYS") {
    refreshHotkeyBindings().catch((err) => {
      console.error("Hotkey refresh failed:", err);
    });
    return false;
  }

  return false;
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Create context menu and refresh hotkeys on install/update
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ancroo-run-workflow",
    title: "Run with Ancroo",
    contexts: ["selection"],
  });

  refreshHotkeyBindings(3).catch(() => {});

  // Re-inject content scripts into existing tabs so hotkeys work immediately
  // after extension reload/update (old content scripts become orphaned).
  reinjectContentScripts();
});

// Refresh hotkeys on browser startup (session storage is cleared on restart)
chrome.runtime.onStartup.addListener(() => {
  refreshHotkeyBindings(3).catch(() => {});
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "ancroo-run-workflow" || !tab?.id) return;
  chrome.sidePanel.open({ tabId: tab.id });
});

// --- Hotkey management ---

/**
 * Fetch hotkey settings from the server and store parsed bindings
 * in chrome.storage.session for the content script to read.
 *
 * Also fetches the workflow list so each binding carries a `needsSidePanel`
 * flag (required for synchronous `sidePanel.open()` in the message handler).
 *
 * Bindings are additionally persisted in chrome.storage.local so they
 * survive browser restarts even when the backend is temporarily unreachable.
 *
 * When called from startup/install, retries up to 3 times with
 * increasing delay so the backend has time to become ready.
 */
async function refreshHotkeyBindings(retries = 0): Promise<void> {
  try {
    const mappings = await fetchHotkeySettings();

    // Use cached workflows if available, otherwise fetch from server.
    const session = await chrome.storage.session.get("cachedWorkflows");
    let workflows: Workflow[] =
      (session.cachedWorkflows as Workflow[] | undefined) ?? [];
    if (workflows.length === 0) {
      workflows = await listWorkflows();
      await chrome.storage.session.set({ cachedWorkflows: workflows });
    }

    const bindings = buildHotkeyBindings(mappings, workflows);
    await chrome.storage.session.set({ [HOTKEY_STORAGE_KEY]: bindings });
    // Persist for offline / startup fallback
    await chrome.storage.local.set({ [HOTKEY_STORAGE_KEY]: bindings });
  } catch (err) {
    console.error("refreshHotkeyBindings failed:", err);
    if (retries > 0) {
      const delay = (4 - retries) * 5_000; // 5s, 10s, 15s
      await new Promise((r) => setTimeout(r, delay));
      return refreshHotkeyBindings(retries - 1);
    }
    // All retries exhausted — fall back to persisted bindings from a
    // previous successful fetch so hotkeys still work across restarts.
    const stored = await chrome.storage.local.get(HOTKEY_STORAGE_KEY);
    const cached = (stored[HOTKEY_STORAGE_KEY] as HotkeyBinding[] | undefined) ?? [];
    if (cached.length > 0) {
      await chrome.storage.session.set({ [HOTKEY_STORAGE_KEY]: cached });
    } else {
      await chrome.storage.session.remove(HOTKEY_STORAGE_KEY);
    }
  }
}

/**
 * Handle workflow execution triggered by a hotkey from the content script.
 *
 * Text workflows: execute directly (GET_SELECTION → API → INSERT_TEXT).
 * Audio/file/complex workflows: set pending state and open the side panel.
 */
async function handleHotkeyExecution(
  workflowSlug: string,
  tab?: chrome.tabs.Tab,
): Promise<void> {
  if (!tab?.id) return;

  // Get workflow metadata to decide how to handle execution
  const session = await chrome.storage.session.get("cachedWorkflows");
  let workflows: Workflow[] = (session.cachedWorkflows as Workflow[] | undefined) ?? [];

  if (workflows.length === 0) {
    try {
      workflows = await listWorkflows();
      await chrome.storage.session.set({ cachedWorkflows: workflows });
    } catch {
      return;
    }
  }

  const workflow = workflows.find((w) => w.slug === workflowSlug);
  if (!workflow) return;

  const collectSources = Array.isArray(workflow.recipe?.collect) ? workflow.recipe.collect : [];
  const needsAudio = collectSources.includes("audio");
  const needsFile = collectSources.includes("file");
  const needsManual = collectSources.includes("manual_input");
  const needsComplexInput =
    collectSources.includes("clipboard") || collectSources.includes("form_fields");

  // Audio/file/complex workflows need the side panel — store pending state.
  // The side panel was already opened synchronously in the onMessage handler
  // (before any await) to preserve the user-gesture context.
  if (needsAudio) {
    await chrome.storage.session.set({ pendingRecording: workflowSlug });
    // Notify side panel if already open (runtime.sendMessage reaches extension pages)
    chrome.runtime.sendMessage({
      type: "START_RECORDING",
      workflowSlug,
    }).catch(() => {});
    return;
  }

  if (needsFile) {
    await chrome.storage.session.set({ pendingFileWorkflow: workflowSlug });
    return;
  }

  if (needsManual || needsComplexInput) {
    await chrome.storage.session.set({ pendingWorkflowSlug: workflowSlug });
    return;
  }

  // Simple text workflow: execute directly from background
  let response;
  try {
    response = await sendToTab<SelectionResultMessage>(tab.id, {
      type: "GET_SELECTION",
    } as ExtensionMessage);
  } catch {
    return;
  }

  if (!response?.text) return;

  // Show processing toast
  await sendToTab(tab.id, {
    type: "SHOW_TOAST",
    text: `${workflow.name}...`,
    variant: "processing",
  } as ExtensionMessage);

  try {
    const result = await executeWorkflow(workflowSlug, {
      text: response.text,
      html: response.html,
      context: { url: response.url, title: response.title },
    });

    await addToHistory({
      id: result.execution_id ?? crypto.randomUUID(),
      workflow_slug: workflow.slug,
      workflow_name: workflow.name,
      input_preview: response.text.slice(0, 100),
      output_preview: (result.result?.text ?? "").slice(0, 100),
      output_full: result.result?.text ?? undefined,
      success: result.result?.success ?? false,
      timestamp: Date.now(),
    });

    if (result.result?.success && result.result.text) {
      const action = workflow.output_action ?? result.result.action ?? "none";

      if (action === "replace_selection" || action === "insert_text") {
        await sendToTab(tab.id, {
          type: "INSERT_TEXT",
          text: result.result.text,
        } as ExtensionMessage);
        await sendToTab(tab.id, {
          type: "SHOW_TOAST",
          text: workflow.name,
          variant: "success",
          duration: 2000,
        } as ExtensionMessage);
      } else if (action === "insert_before") {
        await sendToTab(tab.id, {
          type: "INSERT_BEFORE",
          text: result.result.text,
        } as ExtensionMessage);
        await sendToTab(tab.id, {
          type: "SHOW_TOAST",
          text: workflow.name,
          variant: "success",
          duration: 2000,
        } as ExtensionMessage);
      } else if (action === "insert_after") {
        await sendToTab(tab.id, {
          type: "INSERT_AFTER",
          text: result.result.text,
        } as ExtensionMessage);
        await sendToTab(tab.id, {
          type: "SHOW_TOAST",
          text: workflow.name,
          variant: "success",
          duration: 2000,
        } as ExtensionMessage);
      } else if (action === "side_panel_only" || action === "copy_to_clipboard" || action === "clipboard" || action === "notification") {
        // Clipboard is not available in service workers — show in side panel
        await chrome.storage.session.set({
          pendingResult: {
            text: result.result.text,
            workflowName: workflow.name,
          },
        });
        await sendToTab(tab.id, { type: "HIDE_TOAST" } as ExtensionMessage);
        await tryOpenSidePanel(tab.id);
      }
    } else {
      const errorDetail = result.result?.error
        ? `${workflow.name}: ${result.result.error}`
        : `${workflow.name} failed`;
      await sendToTab(tab.id, {
        type: "SHOW_TOAST",
        text: errorDetail,
        variant: "error",
        duration: 4000,
      } as ExtensionMessage);
    }
  } catch (error) {
    console.error("Workflow execution failed:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    await sendToTab(tab.id, {
      type: "SHOW_TOAST",
      text: msg,
      variant: "error",
      duration: 4000,
    } as ExtensionMessage).catch(() => {});
  }
}

/** Append a history entry to chrome.storage.local (shared with side panel). */
async function addToHistory(entry: HistoryEntry): Promise<void> {
  const stored = await chrome.storage.local.get("history");
  const existing = (stored.history as HistoryEntry[] | undefined) ?? [];
  const updated = [entry, ...existing].slice(0, 50);
  await chrome.storage.local.set({ history: updated });
}

/** Try to open the side panel, silently ignoring user-gesture errors. */
async function tryOpenSidePanel(tabId: number): Promise<void> {
  try {
    await chrome.sidePanel.open({ tabId });
  } catch {
    // sidePanel.open() requires a user gesture context which is lost after await.
    // The pending state is already stored — user can open manually via Ctrl+Shift+Y.
  }
}

/**
 * Re-inject content scripts into all matching tabs.
 *
 * After extension install/update, content scripts from the previous version
 * become orphaned — their keydown listeners still fire but runtime messaging
 * silently fails. Injecting fresh scripts restores hotkey functionality
 * without requiring the user to reload every tab.
 */
async function reinjectContentScripts(): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const files = manifest.content_scripts?.[0]?.js ?? [];
  if (files.length === 0) return;

  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files })
        .catch(() => {});
    }
  } catch {
    // tabs.query or scripting API not available — ignore
  }
}
