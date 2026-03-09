/** File upload configuration in a recipe. */
export interface FileConfig {
  accept: string;
  max_size_mb: number;
  label: string;
  required: boolean;
}

/** Collection recipe — instructions from the server on what data to collect. */
export interface CollectionRecipe {
  collect: ("text_selection" | "clipboard" | "form_fields" | "page_context" | "file" | "audio")[];
  form_fields?: { name: string; selector: string }[];
  file_config?: FileConfig;
}

/** Data packet sent to the server when executing a workflow. */
export interface InputDataPacket {
  text?: string;
  html?: string;
  clipboard?: string;
  fields?: Record<string, string>;
  context?: { url: string; title: string };
}

/** Workflow definition from the backend. */
export interface Workflow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  default_hotkey: string | null;
  input_type: string;
  output_type: string;
  execution_type: string;
  version: string;
  has_client_script: boolean;
  provider_name: string | null;
  sync_status: string;
  workflow_type: string | null;
  recipe: CollectionRecipe | null;
  output_action: string | null;
}

/** Result from executing a workflow. */
export interface ExecutionResult {
  text: string | null;
  action: "replace_selection" | "copy_to_clipboard" | "notification" | "none";
  success: boolean;
  error: string | null;
  metadata: Record<string, unknown>;
}

/** Full execution response from the backend. */
export interface ExecuteWorkflowResponse {
  execution_id: string;
  status: "success" | "error";
  result: ExecutionResult | null;
  duration_ms: number | null;
}

/** Current user info. */
export interface User {
  id: string;
  email: string;
  display_name: string | null;
  groups: string[];
  is_admin: boolean;
}

/** Execution history entry (stored locally). */
export interface HistoryEntry {
  id: string;
  workflow_slug: string;
  workflow_name: string;
  input_preview: string;
  output_preview: string;
  /** Full output text for copy-to-clipboard. */
  output_full?: string;
  success: boolean;
  timestamp: number;
}

/** Single hotkey-to-workflow mapping from the server. */
export interface HotkeyMapping {
  workflow_id: string;
  workflow_slug: string;
  workflow_name: string;
  /** Effective hotkey string (custom or default), e.g. "Ctrl+Shift+G". */
  hotkey: string;
  is_enabled: boolean;
}

/** Parsed hotkey for efficient KeyboardEvent matching. */
export interface ParsedHotkey {
  /** The main key, lowercased (e.g. "g", "r", "1"). */
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** A parsed hotkey bound to a workflow slug for the content script. */
export interface HotkeyBinding {
  parsed: ParsedHotkey;
  workflow_slug: string;
  /** True when the workflow requires the side panel (audio, file, clipboard, form_fields). */
  needsSidePanel: boolean;
}
