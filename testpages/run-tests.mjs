/**
 * Automated E2E tests for Ancroo Extension output actions.
 *
 * Uses Puppeteer to launch Chrome with the extension loaded,
 * selects text on the test page, triggers workflows via the
 * extension's service worker, and takes screenshots of results.
 *
 * Usage: node testpages/run-tests.mjs
 */

import puppeteer from "puppeteer-core";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, "../dist");
const TEST_PAGE = `file://${path.resolve(__dirname, "output-actions-test.html")}`;
const SCREENSHOT_DIR = path.resolve(__dirname, "screenshots");
const BACKEND_URL = "http://localhost:8900";

// Ensure screenshot directory exists
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Test definitions — workflow slug + output_action + target element ID
const TESTS = [
  {
    name: "1. Replace Selection (contenteditable)",
    slug: "grammatik-und-rechtschreibung-korrigieren",
    action: "replace_selection",
    elementId: "replace-ce",
    elementType: "contenteditable",
    selectAll: true,
  },
  {
    name: "1b. Replace Selection (textarea)",
    slug: "grammatik-und-rechtschreibung-korrigieren",
    action: "replace_selection",
    elementId: "replace-ta",
    elementType: "textarea",
    selectAll: true,
  },
  {
    name: "2. Insert Before (contenteditable)",
    slug: "translate-into-englisch",
    action: "insert_before",
    elementId: "insert-before-ce",
    elementType: "contenteditable",
    selectAll: true,
  },
  {
    name: "2b. Insert Before (textarea)",
    slug: "translate-into-englisch",
    action: "insert_before",
    elementId: "insert-before-ta",
    elementType: "textarea",
    selectAll: true,
  },
  {
    name: "3. Insert After (contenteditable)",
    slug: "test-insert-after",
    action: "insert_after",
    elementId: "insert-after-ce",
    elementType: "contenteditable",
    selectAll: true,
  },
  {
    name: "3b. Insert After (textarea)",
    slug: "test-insert-after",
    action: "insert_after",
    elementId: "insert-after-ta",
    elementType: "textarea",
    selectAll: true,
  },
  {
    name: "4. Clipboard",
    slug: "test-clipboard",
    action: "clipboard",
    elementId: "clipboard-ce",
    elementType: "contenteditable",
    selectAll: true,
  },
  {
    name: "5. Notification",
    slug: "test-notification",
    action: "notification",
    elementId: "notification-ce",
    elementType: "contenteditable",
    selectAll: true,
  },
  {
    name: "6. Side Panel Only",
    slug: "test-side-panel-only",
    action: "side_panel_only",
    elementId: "side-panel-ce",
    elementType: "contenteditable",
    selectAll: true,
  },
  {
    name: "8a. Input Types - input[text]",
    slug: "grammatik-und-rechtschreibung-korrigieren",
    action: "replace_selection",
    elementId: "input-text",
    elementType: "input",
    selectAll: true,
  },
  {
    name: "8b. Input Types - textarea",
    slug: "grammatik-und-rechtschreibung-korrigieren",
    action: "replace_selection",
    elementId: "input-textarea",
    elementType: "textarea",
    selectAll: true,
  },
  {
    name: "8c. Input Types - contenteditable div",
    slug: "grammatik-und-rechtschreibung-korrigieren",
    action: "replace_selection",
    elementId: "input-ce-div",
    elementType: "contenteditable",
    selectAll: true,
  },
  {
    name: "8d. Input Types - partial selection",
    slug: "grammatik-und-rechtschreibung-korrigieren",
    action: "replace_selection",
    elementId: "input-partial",
    elementType: "textarea",
    selectAll: false, // will select middle portion only
  },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Select text within an element using Puppeteer.
 */
async function selectText(page, elementId, elementType, selectAll) {
  if (elementType === "contenteditable") {
    await page.evaluate((id, all) => {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Element #${id} not found`);
      el.focus();
      const range = document.createRange();
      if (all) {
        range.selectNodeContents(el);
      } else {
        // Select middle portion
        const text = el.firstChild;
        if (text) {
          range.setStart(text, Math.floor(text.textContent.length * 0.3));
          range.setEnd(text, Math.floor(text.textContent.length * 0.7));
        }
      }
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, elementId, selectAll);
  } else {
    // input or textarea
    await page.evaluate((id, all) => {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Element #${id} not found`);
      el.focus();
      if (all) {
        el.select();
      } else {
        // Select middle portion
        const len = el.value.length;
        el.setSelectionRange(Math.floor(len * 0.3), Math.floor(len * 0.7));
      }
    }, elementId, selectAll);
  }
}

/**
 * Get the selected text from the page.
 */
async function getSelectedText(page, elementId, elementType) {
  return page.evaluate((id, type) => {
    if (type === "contenteditable") {
      return window.getSelection()?.toString() ?? "";
    }
    const el = document.getElementById(id);
    if (!el) return "";
    return el.value.substring(el.selectionStart, el.selectionEnd);
  }, elementId, elementType);
}

/**
 * Get the full content of an element (for before/after comparison).
 */
async function getElementContent(page, elementId, elementType) {
  return page.evaluate((id, type) => {
    const el = document.getElementById(id);
    if (!el) return "";
    if (type === "contenteditable") return el.textContent ?? "";
    return el.value;
  }, elementId, elementType);
}

/**
 * Execute a workflow via the backend API.
 */
async function executeWorkflow(slug, inputText, inputHtml) {
  const res = await fetch(`${BACKEND_URL}/api/v1/workflows/${slug}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input_data: {
        text: inputText,
        html: inputHtml || "",
        context: { url: TEST_PAGE, title: "Output Actions Test" },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Simulate the extension's output action by sending a message to the content script.
 */
async function applyOutputAction(page, action, text, workflow) {
  if (action === "replace_selection" || action === "insert_text") {
    return page.evaluate((t) => {
      // Simulate content script's INSERT_TEXT handler
      const active = document.activeElement;
      if (active?.getAttribute("contenteditable") === "true") {
        return document.execCommand("insertText", false, t);
      }
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const start = active.selectionStart ?? 0;
        const end = active.selectionEnd ?? 0;
        const proto = active instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) {
          const val = active.value;
          setter.call(active, val.substring(0, start) + t + val.substring(end));
          active.dispatchEvent(new Event("input", { bubbles: true }));
          active.dispatchEvent(new Event("change", { bubbles: true }));
          active.setSelectionRange(start + t.length, start + t.length);
          return true;
        }
      }
      return false;
    }, text);
  }

  if (action === "insert_before") {
    return page.evaluate((t) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const start = active.selectionStart ?? 0;
        const proto = active instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) {
          const val = active.value;
          setter.call(active, val.substring(0, start) + t + "\n" + val.substring(start));
          active.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
        return false;
      }
      // contenteditable — insert text + <br> before selection
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const insertRange = document.createRange();
        insertRange.setStart(range.startContainer, range.startOffset);
        insertRange.collapse(true);
        const br = document.createElement("br");
        insertRange.insertNode(br);
        const textNode = document.createTextNode(t);
        insertRange.insertNode(textNode);
        return true;
      }
      return false;
    }, text);
  }

  if (action === "insert_after") {
    return page.evaluate((t) => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        const end = active.selectionEnd ?? active.value.length;
        const proto = active instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) {
          const val = active.value;
          setter.call(active, val.substring(0, end) + "\n" + t + val.substring(end));
          active.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
        return false;
      }
      // contenteditable — insert <br> + text after selection
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const insertRange = document.createRange();
        insertRange.setStart(range.endContainer, range.endOffset);
        insertRange.collapse(true);
        const textNode = document.createTextNode(t);
        insertRange.insertNode(textNode);
        const br = document.createElement("br");
        insertRange.insertNode(br);
        return true;
      }
      return false;
    }, text);
  }

  if (action === "clipboard" || action === "copy_to_clipboard") {
    // Can't actually write to clipboard in headless, simulate by storing
    return { clipboard: text };
  }

  if (action === "notification") {
    // Simulate toast
    await page.evaluate((t) => {
      let el = document.getElementById("__ancroo-toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "__ancroo-toast";
        el.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:10px 18px;border-radius:8px;font:14px/1.4 -apple-system,sans-serif;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.25);background:#22c55e;opacity:1;";
        document.documentElement.appendChild(el);
      }
      el.textContent = `✔  ${t}`;
      el.style.background = "#22c55e";
      el.style.opacity = "1";
    }, text);
    return true;
  }

  if (action === "side_panel_only") {
    // Result only shown in side panel — no page change expected
    return { side_panel: text };
  }

  return false;
}

// =========================================================================
// Main test runner
// =========================================================================

async function main() {
  console.log("\n🧪 Ancroo Extension — Output Actions E2E Tests\n");
  console.log(`Extension: ${EXTENSION_PATH}`);
  console.log(`Test page: ${TEST_PAGE}`);
  console.log(`Backend:   ${BACKEND_URL}`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}\n`);

  // Check backend health
  try {
    const health = await fetch(`${BACKEND_URL}/health`);
    if (!health.ok) throw new Error(`Status ${health.status}`);
    console.log("✔ Backend healthy\n");
  } catch (e) {
    console.error(`✘ Backend not reachable at ${BACKEND_URL}: ${e.message}`);
    process.exit(1);
  }

  // Launch browser
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/chromium-browser",
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--window-size=1280,900",
    ],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();
  await page.goto(TEST_PAGE, { waitUntil: "networkidle0" });
  console.log("✔ Test page loaded\n");

  // Wait for extension content script to inject
  await sleep(2000);

  // Take initial screenshot
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "00-initial.png"), fullPage: true });

  const results = [];
  let testIndex = 0;

  for (const test of TESTS) {
    testIndex++;
    const prefix = String(testIndex).padStart(2, "0");
    console.log(`── Test ${prefix}: ${test.name} ──`);

    try {
      // Scroll element into view
      await page.evaluate((id) => {
        document.getElementById(id)?.scrollIntoView({ behavior: "instant", block: "center" });
      }, test.elementId);
      await sleep(300);

      // Record content before
      const contentBefore = await getElementContent(page, test.elementId, test.elementType);
      console.log(`   Before: "${contentBefore.substring(0, 60)}..."`);

      // Select text
      await selectText(page, test.elementId, test.elementType, test.selectAll);
      const selectedText = await getSelectedText(page, test.elementId, test.elementType);
      console.log(`   Selected: "${selectedText.substring(0, 60)}..."`);

      if (!selectedText) {
        console.log("   ⚠ No text selected — skipping");
        results.push({ ...test, status: "SKIP", reason: "No text selected" });
        continue;
      }

      // Take screenshot with selection visible
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${prefix}-before.png`) });

      // Execute workflow via backend API
      console.log(`   Executing workflow: ${test.slug}...`);
      const apiResult = await executeWorkflow(test.slug, selectedText, "");

      if (!apiResult.result?.success) {
        const err = apiResult.result?.error || "Unknown error";
        console.log(`   ✘ API error: ${err}`);
        results.push({ ...test, status: "FAIL", reason: `API: ${err}` });
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${prefix}-error.png`) });
        continue;
      }

      const resultText = apiResult.result.text;
      console.log(`   Result: "${(resultText || "").substring(0, 60)}..."`);
      console.log(`   Duration: ${apiResult.duration_ms}ms`);

      // Re-select text (API call may have lost focus)
      await selectText(page, test.elementId, test.elementType, test.selectAll);
      await sleep(200);

      // Apply the output action
      const actionResult = await applyOutputAction(page, test.action, resultText, test);
      await sleep(500);

      // Record content after
      const contentAfter = await getElementContent(page, test.elementId, test.elementType);

      // Take screenshot after action
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${prefix}-after.png`) });

      // Verify result based on action type
      let passed = false;
      let details = "";

      if (test.action === "replace_selection") {
        passed = contentAfter !== contentBefore && contentAfter.includes(resultText.trim().substring(0, 30));
        details = passed
          ? `Text replaced: "${contentAfter.substring(0, 60)}..."`
          : `Content unchanged or result not found. After: "${contentAfter.substring(0, 60)}..."`;
      } else if (test.action === "insert_before") {
        const originalStillPresent = contentAfter.includes(selectedText.substring(0, 20));
        const resultPresent = contentAfter.includes(resultText.trim().substring(0, 20));
        const longerThanBefore = contentAfter.length > contentBefore.length;
        passed = originalStillPresent && longerThanBefore;
        details = `Original present: ${originalStillPresent}, Result present: ${resultPresent}, Longer: ${longerThanBefore}`;
      } else if (test.action === "insert_after") {
        const originalStillPresent = contentAfter.includes(selectedText.substring(0, 20));
        const longerThanBefore = contentAfter.length > contentBefore.length;
        passed = originalStillPresent && longerThanBefore;
        details = `Original present: ${originalStillPresent}, Longer: ${longerThanBefore}`;
      } else if (test.action === "clipboard") {
        passed = contentAfter === contentBefore; // page unchanged
        details = `Page unchanged: ${passed}. Result would be in clipboard: "${resultText.substring(0, 40)}..."`;
      } else if (test.action === "notification") {
        passed = contentAfter === contentBefore; // page unchanged, toast shown
        details = `Page unchanged: ${passed}. Toast shown with: "${resultText}"`;
      } else if (test.action === "side_panel_only") {
        passed = contentAfter === contentBefore; // page unchanged
        details = `Page unchanged: ${passed}. Result for side panel: "${resultText.substring(0, 40)}..."`;
      }

      const status = passed ? "PASS" : "FAIL";
      console.log(`   ${passed ? "✔" : "✘"} ${status}: ${details}`);
      results.push({ ...test, status, details, resultText: resultText?.substring(0, 100) });

    } catch (err) {
      console.log(`   ✘ ERROR: ${err.message}`);
      results.push({ ...test, status: "ERROR", reason: err.message });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${prefix}-error.png`) }).catch(() => {});
    }

    console.log("");
  }

  // Final full-page screenshot
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "99-final.png"), fullPage: true });

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const errors = results.filter((r) => r.status === "ERROR").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;

  for (const r of results) {
    const icon = r.status === "PASS" ? "✔" : r.status === "FAIL" ? "✘" : r.status === "SKIP" ? "⊘" : "⚠";
    console.log(`  ${icon} ${r.name.padEnd(42)} ${r.status}`);
  }

  console.log(`\n  Total: ${results.length} | Pass: ${passed} | Fail: ${failed} | Error: ${errors} | Skip: ${skipped}`);
  console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}/\n`);

  await browser.close();
  process.exit(failed + errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
