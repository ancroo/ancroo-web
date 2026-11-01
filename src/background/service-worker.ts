import { buildHotkeyBindings, HOTKEY_STORAGE_KEY } from "@/shared/hotkeys";
import { fetchHotkeySettingsUnified } from "@/shared/action-provider";
import type { ExtensionMessage } from "@/shared/messages";
import type { HotkeyBinding } from "@/shared/types";

// Keep content scripts out of chrome.storage: local holds the API keys, and they
// share a process with every web page. They get their hotkey bindings by message
// instead. Session is set explicitly too, because older versions opened it up.
for (const area of [chrome.storage.local, chrome.storage.session]) {
  area.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch((err) => {
    console.error("Failed to restrict storage access:", err);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from our own extension
  if (sender.id !== chrome.runtime.id) return false;

  // --- Content script detected a hotkey press ---
  if (msg.type === "EXECUTE_HOTKEY_ACTION") {
    // Open the side panel SYNCHRONOUSLY while the user-gesture context is still
    // available.  After any `await` Chrome no longer considers this user-initiated
    // and chrome.sidePanel.open() silently fails.  The side panel is the single
    // orchestrator now, so every hotkey opens it (a no-op when already open).
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    }
    // Queue the action for the side panel to pick up. The nonce makes the
    // storage value change on every press, so an already-open panel reacts via
    // storage.onChanged even when the same hotkey is pressed twice in a row.
    // windowId scopes the trigger: side panels are per-window and all of them
    // see the storage change, but only the panel in the hotkey's window may
    // run the action — otherwise every open panel would execute it against
    // its own window's active tab.
    chrome.storage.session
      .set({
        pendingActionTrigger: {
          slug: msg.actionSlug,
          nonce: Date.now(),
          windowId: sender.tab?.windowId ?? null,
        },
      })
      .catch(() => {});
    return false;
  }

  // --- Content script loaded, hand it the hotkey map ---
  if (msg.type === "GET_HOTKEY_BINDINGS") {
    getHotkeyBindings().then(sendResponse, (err) => {
      console.error("Hotkey lookup failed:", err);
      sendResponse([]);
    });
    return true; // keep channel open for async sendResponse
  }

  // --- Side panel loaded actions, refresh the hotkey map ---
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

// Refresh hotkeys and re-inject content scripts on install/update
chrome.runtime.onInstalled.addListener((details) => {
  refreshHotkeyBindings(3).catch(() => {});

  // Re-inject content scripts into existing tabs so hotkeys work immediately
  // after extension install/update (old content scripts become orphaned).
  // Skip chrome_update/browser_update: restored tabs get the manifest-injected
  // script anyway, so re-injecting would only add a redundant second copy.
  if (details.reason === "install" || details.reason === "update") {
    reinjectContentScripts();
  }
});

// Refresh hotkeys on browser startup (session storage is cleared on restart)
chrome.runtime.onStartup.addListener(() => {
  refreshHotkeyBindings(3).catch(() => {});
});

// --- Hotkey management ---

async function readHotkeyBindings(area: chrome.storage.StorageArea): Promise<HotkeyBinding[]> {
  const stored = await area.get(HOTKEY_STORAGE_KEY);
  return (stored[HOTKEY_STORAGE_KEY] as HotkeyBinding[] | undefined) ?? [];
}

/**
 * The bindings for a freshly loaded content script: session storage first, then
 * the persisted copy (session storage is empty after a browser restart), and
 * only when both are empty a refresh from the local actions.
 */
async function getHotkeyBindings(): Promise<HotkeyBinding[]> {
  const fromSession = await readHotkeyBindings(chrome.storage.session);
  if (fromSession.length > 0) return fromSession;

  const persisted = await readHotkeyBindings(chrome.storage.local);
  if (persisted.length > 0) {
    await chrome.storage.session.set({ [HOTKEY_STORAGE_KEY]: persisted });
    return persisted;
  }

  await refreshHotkeyBindings();
  return readHotkeyBindings(chrome.storage.session);
}

/**
 * Store bindings in chrome.storage.session and, if they changed, push them to
 * the content scripts of all tabs. The comparison matters: without any hotkeys
 * every page load ends in a refresh, which must not message every open tab.
 * Both sides are read back from storage because it reorders object keys, so a
 * fresh value never stringifies like its stored copy.
 */
async function publishHotkeyBindings(bindings: HotkeyBinding[]): Promise<void> {
  const previous = JSON.stringify(await readHotkeyBindings(chrome.storage.session));
  await chrome.storage.session.set({ [HOTKEY_STORAGE_KEY]: bindings });
  if (JSON.stringify(await readHotkeyBindings(chrome.storage.session)) === previous) return;

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    const message: ExtensionMessage = { type: "HOTKEY_BINDINGS_CHANGED", bindings };
    // Rejects for tabs without a content script (chrome:// pages etc.).
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}

/**
 * Fetch hotkey settings and publish the parsed bindings to the content scripts.
 *
 * Bindings are additionally persisted in chrome.storage.local so they
 * survive browser restarts.
 *
 * When called from startup/install, retries up to 3 times with
 * increasing delay so local storage has time to become ready.
 */
async function refreshHotkeyBindings(retries = 0): Promise<void> {
  try {
    const mappings = await fetchHotkeySettingsUnified();

    const bindings = buildHotkeyBindings(mappings);
    await publishHotkeyBindings(bindings);
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
    await publishHotkeyBindings(await readHotkeyBindings(chrome.storage.local));
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
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files }).catch(() => {});
    }
  } catch {
    // tabs.query or scripting API not available — ignore
  }
}
