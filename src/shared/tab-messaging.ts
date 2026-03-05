/**
 * Tab messaging helper with automatic content-script injection.
 *
 * Tabs that were already open when the extension was installed do not have the
 * content script injected. This helper injects it on demand when a sendMessage
 * call fails, then retries — so callers never need to know about this.
 */

const injectedTabs = new Set<number>();

/** Send a message to the content script in a tab, injecting it first if needed. */
export async function sendToTab(tabId: number, message: object): Promise<unknown> {
  if (!injectedTabs.has(tabId)) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      await injectContentScript(tabId);
    }
  }

  return chrome.tabs.sendMessage(tabId, message);
}

async function injectContentScript(tabId: number): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  const files = manifest.content_scripts?.[0]?.js ?? [];

  if (files.length === 0) {
    throw new Error("No content script files in manifest");
  }

  await chrome.scripting.executeScript({ target: { tabId }, files });
  injectedTabs.add(tabId);

  // Give the script a moment to register its message listener
  await new Promise((r) => setTimeout(r, 80));
}
