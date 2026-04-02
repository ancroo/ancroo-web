/** Unified workflow listing — dispatches to backend or local store based on connection mode. */

import type { Workflow, HotkeyMapping } from "./types";
import { getConnectionMode } from "./connection-mode";
import {
  listWorkflows as backendListWorkflows,
  fetchHotkeySettings as backendFetchHotkeySettings,
} from "./api-client";
import { listLocalWorkflows } from "./local-workflows";

/** List all workflows (from backend or local store). */
export async function listWorkflowsUnified(): Promise<Workflow[]> {
  const mode = await getConnectionMode();

  if (mode === "backend") {
    return backendListWorkflows();
  }

  return listLocalWorkflows();
}

/** Fetch hotkey mappings (from backend or derived from local workflows). */
export async function fetchHotkeySettingsUnified(): Promise<HotkeyMapping[]> {
  const mode = await getConnectionMode();

  if (mode === "backend") {
    return backendFetchHotkeySettings();
  }

  const workflows = await listLocalWorkflows();
  return workflows
    .filter((w) => w.default_hotkey)
    .map((w) => ({
      workflow_id: w.id,
      workflow_slug: w.slug,
      workflow_name: w.name,
      hotkey: w.default_hotkey!,
      is_enabled: true,
    }));
}
