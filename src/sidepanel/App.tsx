import { useState, useEffect } from "preact/hooks";
import {
  listWorkflows,
  executeWorkflow,
  executeWorkflowWithFile,
  getCurrentUser,
} from "@/shared/api-client";
import {
  getSettings,
  isSetupComplete,
} from "@/shared/settings";
import {
  login as authLogin,
  logout as authLogout,
  isLoggedIn,
  isAuthRequired,
} from "@/shared/auth";
import type {
  Workflow,
  User,
  HistoryEntry,
  CollectionRecipe,
  InputDataPacket,
  FileConfig,
} from "@/shared/types";
import type { ExtensionMessage, SelectionResultMessage, FormFieldsResultMessage, PageHtmlResultMessage } from "@/shared/messages";
import { sendToTab } from "@/shared/tab-messaging";
import { HOTKEY_STORAGE_KEY } from "@/shared/hotkeys";
import { needsFileInput, needsAudioInput, needsManualInput, formatFileSize, friendlyError, categoryIcon } from "./utils";
import { RecordingArea } from "./RecordingArea";
import { HistoryItem } from "./HistoryItem";
import { FileUploadArea } from "./FileUploadArea";
import { UploadProgressDisplay } from "./UploadProgressDisplay";
import { SetupScreen } from "./SetupScreen";
import { AboutPanel } from "./AboutPanel";

export function App() {
  const [setupDone, setSetupDone] = useState<boolean | null>(null);
  const [authEnabled, setAuthEnabled] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // File upload state
  const [pendingWorkflow, setPendingWorkflow] = useState<Workflow | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Audio recording state
  const [autoStartRecording, setAutoStartRecording] = useState(false);
  const [stopRecordingSignal, setStopRecordingSignal] = useState(0);
  const [micDeviceId, setMicDeviceId] = useState<string | undefined>();

  // Manual input state
  const [manualInputText, setManualInputText] = useState("");

  // About panel state
  const [showAbout, setShowAbout] = useState(false);

  // Result display state
  const [resultText, setResultText] = useState<string | null>(null);
  const [resultWorkflowName, setResultWorkflowName] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Collapsed categories
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const toggleCategory = (cat: string) =>
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  useEffect(() => {
    init();
  }, []);

  // Sync history when background script adds entries (hotkey-triggered workflows)
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === "local" && changes.history) {
        setHistory((changes.history.newValue as HistoryEntry[] | undefined) ?? []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Listen for START_RECORDING messages from background script (hotkey)
  useEffect(() => {
    const handler = (message: ExtensionMessage, sender: chrome.runtime.MessageSender) => {
      // Only accept messages from our own extension
      if (sender.id !== chrome.runtime.id) return;

      if (message.type === "START_RECORDING") {
        const workflow = workflows.find((w) => w.slug === message.workflowSlug);
        if (workflow && needsAudioInput(workflow)) {
          if (pendingWorkflow?.slug === workflow.slug) {
            // Already recording this workflow — toggle: stop it
            setStopRecordingSignal((n) => n + 1);
            return;
          }
          setPendingWorkflow(workflow);
          setSelectedFile(null);
          setFileError(null);
          setAutoStartRecording(true);
          setStopRecordingSignal(0);
        }
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [workflows, pendingWorkflow]);

  async function init() {
    const done = await isSetupComplete();
    setSetupDone(done);
    if (done) {
      await loadData();
    }
    setLoading(false);
  }

  async function loadData() {
    try {
      setError(null);
      setNeedsLogin(false);

      // Check if the backend requires authentication
      const settings = await getSettings();
      const authRequired = await isAuthRequired(settings.backend_url);
      setAuthEnabled(authRequired);

      if (authRequired) {
        const loggedIn = await isLoggedIn();
        if (!loggedIn) {
          setNeedsLogin(true);
          return;
        }
      }

      const [userInfo, workflowList, stored, session] = await Promise.all([
        getCurrentUser(),
        listWorkflows(),
        chrome.storage.local.get("history"),
        chrome.storage.session.get([
          "pendingRecording",
          "pendingFileWorkflow",
          "pendingWorkflowSlug",
          "pendingResult",
        ]),
      ]);
      setUser(userInfo);
      setWorkflows(workflowList);
      setHistory((stored.history as HistoryEntry[] | undefined) ?? []);
      setMicDeviceId(settings.microphone_device_id);

      // Cache workflows for background hotkey execution and refresh bindings
      await chrome.storage.session.set({ cachedWorkflows: workflowList });
      chrome.runtime.sendMessage({ type: "REFRESH_HOTKEYS" }).catch(() => {});

      // Check if a recording was triggered via hotkey before the panel was ready
      if (session.pendingRecording) {
        await chrome.storage.session.remove("pendingRecording");
        const target = workflowList.find(
          (w) => w.slug === session.pendingRecording
        );
        if (target && Array.isArray(target.recipe?.collect) && target.recipe.collect.includes("audio")) {
          setPendingWorkflow(target);
          setAutoStartRecording(true);
        }
      }

      // Check if a file workflow was triggered via hotkey
      if (session.pendingFileWorkflow) {
        await chrome.storage.session.remove("pendingFileWorkflow");
        const target = workflowList.find(
          (w) => w.slug === session.pendingFileWorkflow
        );
        if (target && Array.isArray(target.recipe?.collect) && target.recipe.collect.includes("file")) {
          setPendingWorkflow(target);
        }
      }

      // Check if a complex workflow was triggered via hotkey (needs side panel collection)
      if (session.pendingWorkflowSlug) {
        await chrome.storage.session.remove("pendingWorkflowSlug");
        const target = workflowList.find(
          (w) => w.slug === session.pendingWorkflowSlug
        );
        if (target) {
          // Execute the workflow through the normal side panel flow
          // Use setTimeout to avoid calling setState during render
          setTimeout(() => handleExecute(target), 0);
        }
      }

      // Check if background executed a workflow and has a result to display
      if (session.pendingResult) {
        await chrome.storage.session.remove("pendingResult");
        const pending = session.pendingResult as { text: string; workflowName: string };
        setResultText(pending.text);
        setResultWorkflowName(pending.workflowName);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      // 401 → tokens expired or revoked, need re-login
      if (msg.includes("Not logged in") || msg.includes("401")) {
        await authLogout();
        setNeedsLogin(true);
      } else {
        setError(friendlyError(msg));
      }
    }
  }

  async function handleLogin() {
    setLoggingIn(true);
    setError(null);
    try {
      const settings = await getSettings();
      await authLogin(settings.backend_url);
      setNeedsLogin(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await authLogout();
    await chrome.storage.session.remove([HOTKEY_STORAGE_KEY, "cachedWorkflows"]);
    setUser(null);
    setWorkflows([]);
    setNeedsLogin(true);
  }

  async function collectInputData(
    recipe: CollectionRecipe,
    tabId: number
  ): Promise<InputDataPacket> {
    const packet: InputDataPacket = {};

    const sources = Array.isArray(recipe.collect) ? recipe.collect : [];
    for (const source of sources) {
      switch (source) {
        case "text_selection": {
          const sel = await sendToTab<SelectionResultMessage>(tabId, { type: "GET_SELECTION" });
          packet.text = sel?.text ?? "";
          packet.html = sel?.html ?? "";
          if (!packet.context) {
            packet.context = { url: sel?.url ?? "", title: sel?.title ?? "" };
          }
          break;
        }
        case "clipboard":
          try {
            packet.clipboard = await navigator.clipboard.readText();
          } catch {
            packet.clipboard = "";
          }
          break;
        case "form_fields":
          if (recipe.form_fields?.length) {
            const res = await sendToTab<FormFieldsResultMessage>(tabId, {
              type: "GET_FORM_FIELDS",
              fields: recipe.form_fields,
            });
            packet.fields = res?.fields ?? {};
          }
          break;
        case "page_context": {
          if (!packet.context) {
            const ctx = await sendToTab<SelectionResultMessage>(tabId, { type: "GET_SELECTION" });
            packet.context = {
              url: ctx?.url ?? "",
              title: ctx?.title ?? "",
            };
          }
          break;
        }
        case "page_html": {
          const page = await sendToTab<PageHtmlResultMessage>(tabId, { type: "GET_PAGE_HTML" });
          packet.html = page?.html ?? "";
          if (!packet.context) {
            packet.context = { url: page?.url ?? "", title: page?.title ?? "" };
          }
          break;
        }
        case "manual_input":
          packet.text = manualInputText;
          break;
        case "file":
        case "audio":
          // Handled separately via file upload / recording UI
          break;
      }
    }
    return packet;
  }

  async function applyAction(
    action: string,
    resultText: string,
    tabId: number,
    outputFields?: { name: string; selector: string }[],
    metadata?: Record<string, unknown>
  ) {
    console.debug("[ancroo] applyAction:", action);
    switch (action) {
      case "replace_selection":
      case "insert_text":
        await sendToTab(tabId, {
          type: "INSERT_TEXT",
          text: resultText,
        });
        await sendToTab(tabId, {
          type: "SHOW_TOAST",
          text: "Text inserted",
          variant: "success",
          duration: 2000,
        } as ExtensionMessage);
        break;
      case "clipboard":
      case "copy_to_clipboard":
        try {
          await navigator.clipboard.writeText(resultText);
          await sendToTab(tabId, {
            type: "SHOW_TOAST",
            text: "Copied to clipboard",
            variant: "success",
            duration: 2000,
          } as ExtensionMessage);
        } catch (err) {
          console.error("[ancroo] Clipboard write failed:", err);
          // Show result in panel as fallback — never replace selection
          setResultText(resultText);
        }
        break;
      case "fill_fields":
        try {
          const resultData = JSON.parse(resultText);
          if (!outputFields || outputFields.length === 0) {
            console.warn("[ancroo] fill_fields action but no output_fields in recipe");
            break;
          }
          const fieldsToSet: Record<string, { selector: string; value: string }> = {};
          for (const field of outputFields) {
            if (field.name in resultData) {
              fieldsToSet[field.name] = {
                selector: field.selector,
                value: String(resultData[field.name]),
              };
            }
          }
          await sendToTab(tabId, { type: "SET_FORM_FIELDS", fields: fieldsToSet } as ExtensionMessage);
          await sendToTab(tabId, {
            type: "SHOW_TOAST",
            text: "Fields updated",
            variant: "success",
            duration: 2000,
          } as ExtensionMessage);
        } catch (err) {
          console.error("[ancroo] fill_fields parse error:", err);
        }
        break;
      case "insert_before":
        await sendToTab(tabId, {
          type: "INSERT_BEFORE",
          text: resultText,
        });
        await sendToTab(tabId, {
          type: "SHOW_TOAST",
          text: "Text inserted before selection",
          variant: "success",
          duration: 2000,
        } as ExtensionMessage);
        break;
      case "insert_after":
        await sendToTab(tabId, {
          type: "INSERT_AFTER",
          text: resultText,
        });
        await sendToTab(tabId, {
          type: "SHOW_TOAST",
          text: "Text inserted after selection",
          variant: "success",
          duration: 2000,
        } as ExtensionMessage);
        break;
      case "download_file": {
        const filename = (metadata?.filename as string) || "download.txt";
        const mimeType = (metadata?.mime_type as string) || "text/plain";
        try {
          // Use a data URL instead of blob URL to avoid revocation timing issues
          // with saveAs dialogs (blob gets revoked before user picks a location).
          let dataUrl: string;
          if (mimeType.startsWith("text/") || mimeType === "application/json") {
            dataUrl = `data:${mimeType};charset=utf-8,${encodeURIComponent(resultText)}`;
          } else {
            dataUrl = `data:${mimeType};base64,${resultText}`;
          }
          await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
          sendToTab(tabId, {
            type: "SHOW_TOAST",
            text: `Download: ${filename}`,
            variant: "success",
            duration: 3000,
          } as ExtensionMessage).catch(() => {});
        } catch (err) {
          console.error("[ancroo] download_file failed:", err);
          setError("Download failed");
        }
        break;
      }
      case "side_panel_only":
        // Only shown in-panel, no page action
        break;
      case "notification":
        // Shown in-panel via result display
        break;
    }
  }

  function validateFile(file: File, config: FileConfig): string | null {
    if (file.size > config.max_size_mb * 1024 * 1024) {
      return `File too large: ${formatFileSize(file.size)} (max ${config.max_size_mb} MB)`;
    }
    if (config.accept && config.accept !== "*/*") {
      const accepted = config.accept.split(",").map((s) => s.trim().toLowerCase());
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!accepted.some((a) => ext === a || file.type === a)) {
        return `File type not accepted. Allowed: ${config.accept}`;
      }
    }
    return null;
  }

  function handleFileSelect(file: File, workflow: Workflow) {
    const config = workflow.recipe?.file_config;
    if (config) {
      const err = validateFile(file, config);
      if (err) {
        setFileError(err);
        return;
      }
    }
    setFileError(null);
    setSelectedFile(file);
  }

  async function handleExecute(workflow: Workflow) {
    // If this workflow needs a file, audio, or manual input, show the appropriate input area
    if (needsFileInput(workflow) || needsAudioInput(workflow) || needsManualInput(workflow)) {
      if (pendingWorkflow?.slug === workflow.slug && !needsManualInput(workflow)) {
        // Toggle off (but not for manual input — that submits via button)
        setPendingWorkflow(null);
        setSelectedFile(null);
        setFileError(null);
        setAutoStartRecording(false);
      } else if (pendingWorkflow?.slug !== workflow.slug) {
        setPendingWorkflow(workflow);
        setSelectedFile(null);
        setFileError(null);
        setAutoStartRecording(false);
        setManualInputText("");
      }
      return;
    }

    // Standard text-based execution
    await executeTextWorkflow(workflow);
  }

  function handleRecordingComplete(file: File, workflow: Workflow) {
    setAutoStartRecording(false);
    // Auto-submit: pass file directly to bypass async state update
    handleExecuteWithFile(workflow, file);
  }

  async function executeTextWorkflow(workflow: Workflow) {
    setExecuting(workflow.slug);
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) return;

      // Extensions cannot inject content scripts into restricted pages
      const tabUrl = tab.url ?? "";
      if (
        tabUrl.startsWith("chrome://") ||
        tabUrl.startsWith("chrome-extension://") ||
        tabUrl.startsWith("about:")
      ) {
        setError("Cannot run workflows on this page. Please switch to a regular website tab.");
        return;
      }

      let inputData: InputDataPacket;

      if (workflow.recipe) {
        inputData = await collectInputData(workflow.recipe, tab.id);
      } else {
        const response = await sendToTab<SelectionResultMessage>(tab.id, { type: "GET_SELECTION" });
        inputData = {
          text: response?.text ?? "",
          html: response?.html ?? "",
          context: { url: response?.url ?? "", title: response?.title ?? "" },
        };
      }

      const result = await executeWorkflow(workflow.slug, inputData);

      const entry: HistoryEntry = {
        id: result.execution_id,
        workflow_slug: workflow.slug,
        workflow_name: workflow.name,
        input_preview: (inputData.text ?? "").substring(0, 100),
        output_preview: result.result?.text?.substring(0, 100) ?? "",
        output_full: result.result?.text ?? undefined,
        success: result.result?.success ?? false,
        timestamp: Date.now(),
      };
      const newHistory = [entry, ...history].slice(0, 50);
      setHistory(newHistory);
      await chrome.storage.local.set({ history: newHistory });

      if (result.result?.success && result.result.text) {
        const action =
          workflow.output_action ?? result.result.action ?? "none";

        if (
          action !== "replace_selection" &&
          action !== "insert_text" &&
          action !== "insert_before" &&
          action !== "insert_after" &&
          action !== "download_file"
        ) {
          // Show result in panel for clipboard/notification/side_panel_only/fill_fields actions
          setResultText(result.result.text);
          setResultWorkflowName(workflow.name);
        }

        await applyAction(action, result.result.text, tab.id, workflow.recipe?.output_fields, result.result.metadata);
      } else if (result.result && !result.result.success) {
        setError(result.result.error ?? `${workflow.name} failed`);
      } else if (result.result?.success && !result.result.text) {
        setError(`${workflow.name}: no output returned. Check your selection.`);
      }
    } catch (err) {
      console.error("Execution failed:", err);
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setExecuting(null);
    }
  }

  async function handleExecuteWithFile(workflow: Workflow, fileOverride?: File) {
    const file = fileOverride ?? selectedFile;
    if (!file) return;

    setExecuting(workflow.slug);
    setUploadProgress(0);
    setProcessing(false);

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // Collect non-file input data
      let inputData: InputDataPacket = {};
      if (workflow.recipe && tab?.id) {
        inputData = await collectInputData(workflow.recipe, tab.id);
      }

      const result = await executeWorkflowWithFile(
        workflow.slug,
        inputData,
        file,
        (percent) => {
          setUploadProgress(percent);
          if (percent >= 100) {
            setProcessing(true);
          }
        },
      );

      // Add to history
      const entry: HistoryEntry = {
        id: result.execution_id,
        workflow_slug: workflow.slug,
        workflow_name: workflow.name,
        input_preview: file.name,
        output_preview: result.result?.text?.substring(0, 100) ?? "",
        output_full: result.result?.text ?? undefined,
        success: result.result?.success ?? false,
        timestamp: Date.now(),
      };
      const newHistory = [entry, ...history].slice(0, 50);
      setHistory(newHistory);
      await chrome.storage.local.set({ history: newHistory });

      // Show result
      if (result.result?.success && result.result.text) {
        const action = workflow.output_action ?? result.result.action ?? "none";

        if (action !== "download_file") {
          setResultText(result.result.text);
          setResultWorkflowName(workflow.name);
        }

        // Also apply the configured action
        if (tab?.id) {
          await applyAction(action, result.result.text, tab.id, workflow.recipe?.output_fields, result.result.metadata);
        }
      } else if (result.result?.error) {
        setFileError(result.result.error);
      }

      // Clear file state
      setPendingWorkflow(null);
      setSelectedFile(null);
    } catch (err) {
      console.error("File execution failed:", err);
      setFileError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setExecuting(null);
      setUploadProgress(null);
      setProcessing(false);
    }
  }

  async function handleCopyResult() {
    if (!resultText) return;
    await navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading || setupDone === null) {
    return (
      <div class="flex items-center justify-center h-screen">
        <div class="text-gray-500">Loading...</div>
      </div>
    );
  }

  // Setup screen — shown on first use
  if (!setupDone) {
    return <SetupScreen onComplete={() => { setSetupDone(true); loadData(); }} />;
  }

  // Login screen — shown when tokens are missing or expired
  if (needsLogin) {
    return (
      <div class="flex flex-col items-center justify-center h-screen p-6 gap-4">
        <h1 class="text-xl font-bold">Ancroo</h1>
        <p class="text-sm text-gray-600 text-center">
          Sign in to your Ancroo server to get started.
        </p>
        {error && (
          <p class="text-red-600 text-center text-sm">{error}</p>
        )}
        <button
          onClick={handleLogin}
          disabled={loggingIn}
          class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loggingIn ? "Signing in..." : "Sign in"}
        </button>
        <button
          onClick={() => setSetupDone(false)}
          class="text-xs text-gray-400 hover:text-gray-600"
        >
          Change server settings
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div class="flex flex-col items-center justify-center h-screen p-6 gap-4">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <h2 class="text-base font-semibold text-gray-800">Something went wrong</h2>
        <p class="text-red-600 text-center text-sm">{error}</p>
        <button
          onClick={() => { setError(null); loadData(); }}
          class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Retry
        </button>
        <button
          onClick={() => setSetupDone(false)}
          class="text-xs text-gray-400 hover:text-gray-600"
        >
          Change server settings
        </button>
      </div>
    );
  }

  // About panel
  if (showAbout) {
    return <AboutPanel onClose={() => setShowAbout(false)} />;
  }

  // Result display — shown after successful file workflow execution
  if (resultText !== null) {
    return (
      <div class="flex flex-col h-screen">
        <div class="flex items-center justify-between p-3 border-b bg-white">
          <h1 class="font-bold text-sm">Ancroo</h1>
          <button
            onClick={() => { setResultText(null); setCopied(false); }}
            class="text-xs text-gray-400 hover:text-gray-600"
          >
            Close
          </button>
        </div>

        <div class="flex-1 flex flex-col p-3 min-h-0">
          <h2 class="text-xs font-semibold text-gray-500 uppercase mb-2">
            Result: {resultWorkflowName}
          </h2>
          <textarea
            readOnly
            value={resultText}
            class="flex-1 w-full p-3 bg-white border rounded-lg text-sm font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
          <button
            onClick={handleCopyResult}
            class="mt-2 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm"
          >
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="flex flex-col h-screen">
      {/* Header */}
      <div class="flex items-center justify-between p-3 border-b bg-white">
        <h1 class="font-bold text-sm">Ancroo</h1>
        <div class="flex items-center gap-2">
          <button
            onClick={() => setShowAbout(true)}
            class="text-gray-400 hover:text-gray-600"
            title="About Ancroo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
          <span class="text-xs text-gray-500">
            {user?.display_name && !/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(user.display_name)
              ? user.display_name
              : user?.email?.split("@")[0] ?? "User"}
          </span>
          {authEnabled && (
            <button
              onClick={handleLogout}
              class="text-xs text-gray-400 hover:text-gray-600"
            >
              Sign out
            </button>
          )}
          <button
            onClick={() => loadData()}
            class="text-gray-400 hover:text-gray-600"
            title="Reload workflows"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          <button
            onClick={() => setSetupDone(false)}
            class="text-xs text-gray-400 hover:text-gray-600"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Workflows */}
      <div class="flex-1 overflow-y-auto p-3">
        {Object.entries(
          workflows.reduce<Record<string, Workflow[]>>((groups, w) => {
            const cat = w.category ?? "other";
            (groups[cat] ??= []).push(w);
            return groups;
          }, {})
        )
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([category, categoryWorkflows]) => (
          <div key={category} class="mb-4">
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              class="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase mb-2 hover:text-gray-700 cursor-pointer select-none w-full text-left"
            >
              <span class={`inline-block transition-transform duration-200 ${collapsedCategories.has(category) ? "" : "rotate-90"}`}>▶</span>
              {categoryIcon(categoryWorkflows[0])} {category}
            </button>
            {!collapsedCategories.has(category) && <div class="space-y-2">
          {categoryWorkflows.map((workflow) => {
            const isFile = needsFileInput(workflow);
            const isAudio = needsAudioInput(workflow);
            const isManual = needsManualInput(workflow);
            const isPending = pendingWorkflow?.slug === workflow.slug;
            const isExecuting = executing === workflow.slug;

            return (
              <div key={workflow.id}>
                <button
                  onClick={() => handleExecute(workflow)}
                  disabled={executing !== null && !isPending}
                  class="w-full text-left p-3 bg-white rounded-lg border hover:border-blue-300 hover:shadow-sm transition disabled:opacity-50"
                >
                  <div class="font-medium text-sm">{workflow.name}</div>
                  {workflow.description && (
                    <div class="text-xs text-gray-500 mt-0.5">
                      {workflow.description}
                    </div>
                  )}
                  <div class="flex items-center gap-2 mt-1">
                    {workflow.default_hotkey && (
                      <span class="text-xs text-blue-500">
                        {workflow.default_hotkey}
                      </span>
                    )}
                    {isAudio && (
                      <span class="text-xs text-red-500">Voice</span>
                    )}
                    {isFile && (
                      <span class="text-xs text-purple-500">File upload</span>
                    )}
                    {isManual && (
                      <span class="text-xs text-teal-500">Manual input</span>
                    )}
                  </div>
                  {isExecuting && !isFile && !isAudio && (
                    <div class="flex items-center gap-2 text-xs text-amber-600 mt-1">
                      <span class="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                      <span>Processing with AI...</span>
                    </div>
                  )}
                </button>

                {/* Audio recording area */}
                {isPending && isAudio && (
                  <div class="mt-1 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    {isExecuting ? (
                      <UploadProgressDisplay
                        progress={uploadProgress}
                        processing={processing}
                        fileName="Audio recording"
                      />
                    ) : (
                      <RecordingArea
                        autoStart={autoStartRecording}
                        stopSignal={stopRecordingSignal}
                        deviceId={micDeviceId}
                        onRecordingComplete={(file) =>
                          handleRecordingComplete(file, workflow)
                        }
                        onError={(err) => setFileError(err)}
                      />
                    )}
                    {fileError && (
                      <div class="text-xs text-red-600 mt-1">{fileError}</div>
                    )}
                  </div>
                )}

                {/* File upload area */}
                {isPending && isFile && (
                  <div class="mt-1 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    {isExecuting ? (
                      <UploadProgressDisplay
                        progress={uploadProgress}
                        processing={processing}
                        fileName={selectedFile?.name ?? ""}
                      />
                    ) : (
                      <FileUploadArea
                        config={workflow.recipe?.file_config ?? {
                          accept: "*/*",
                          max_size_mb: 200,
                          label: "File",
                          required: true,
                        }}
                        file={selectedFile}
                        error={fileError}
                        onFileSelect={(f) => handleFileSelect(f, workflow)}
                        onClear={() => {
                          setSelectedFile(null);
                          setFileError(null);
                        }}
                      />
                    )}

                    {selectedFile && !isExecuting && (
                      <div class="flex gap-2 mt-2">
                        <button
                          onClick={() => handleExecuteWithFile(workflow)}
                          class="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm"
                        >
                          Run
                        </button>
                        <button
                          onClick={() => {
                            setPendingWorkflow(null);
                            setSelectedFile(null);
                            setFileError(null);
                          }}
                          class="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Manual text input area */}
                {isPending && isManual && !isFile && !isAudio && (
                  <div class="mt-1 p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <textarea
                      value={manualInputText}
                      onInput={(e) => setManualInputText((e.target as HTMLTextAreaElement).value)}
                      placeholder="Enter text..."
                      class="w-full p-2 bg-white border rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
                      rows={4}
                      disabled={isExecuting}
                    />
                    {isExecuting && (
                      <div class="flex items-center gap-2 text-xs text-amber-600 mt-1">
                        <span class="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                        <span>Processing with AI...</span>
                      </div>
                    )}
                    {!isExecuting && (
                      <div class="flex gap-2 mt-2">
                        <button
                          onClick={() => executeTextWorkflow(workflow)}
                          disabled={!manualInputText.trim()}
                          class="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50"
                        >
                          Run
                        </button>
                        <button
                          onClick={() => {
                            setPendingWorkflow(null);
                            setManualInputText("");
                          }}
                          class="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
            </div>}
          </div>
        ))}
        {workflows.length === 0 && (
          <div class="text-sm text-gray-400 text-center py-4">
            No workflows available
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setRecentCollapsed((v) => !v)}
              class="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase mt-6 mb-2 hover:text-gray-700 cursor-pointer select-none w-full text-left"
            >
              <span class={`inline-block transition-transform duration-200 ${recentCollapsed ? "" : "rotate-90"}`}>▶</span>
              Recent
            </button>
            {!recentCollapsed && <div class="space-y-1">
              {history.slice(0, 10).map((entry) => (
                <HistoryItem
                  key={entry.id}
                  entry={entry}
                  onCopy={async (text) => {
                    await navigator.clipboard.writeText(text);
                  }}
                  onView={(entry) => {
                    if (entry.output_full) {
                      setResultText(entry.output_full);
                      setResultWorkflowName(entry.workflow_name);
                    }
                  }}
                />
              ))}
            </div>}
          </>
        )}
      </div>
    </div>
  );
}
