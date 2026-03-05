import type { Workflow } from "@/shared/types";

/** Check if a workflow requires file input. */
export function needsFileInput(workflow: Workflow): boolean {
  return workflow.recipe?.collect.includes("file") ?? false;
}

/** Check if a workflow requires audio recording. */
export function needsAudioInput(workflow: Workflow): boolean {
  return workflow.recipe?.collect.includes("audio") ?? false;
}

/** Format file size for display. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Format a timestamp as a relative time string. */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Map technical error messages to user-friendly descriptions. */
export function friendlyError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("permission") || lower.includes("manifest"))
    return "Cannot access this page. Select text on a regular webpage, then click a workflow.";
  if (lower.includes("no tab") || lower.includes("tab") && lower.includes("missing"))
    return "No active tab found. Open a webpage and try again.";
  if (lower.includes("cannot access contents") || lower.includes("could not establish connection"))
    return "Could not connect to the page. Try refreshing the tab.";
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("econnrefused"))
    return "Cannot connect to the Ancroo server. Check that it is running.";
  return msg;
}

const CATEGORY_ICONS: Record<string, string> = {
  text: "\u270F\uFE0F",
  voice: "\uD83C\uDF99\uFE0F",
  automation: "\u26A1",
  translation: "\uD83C\uDF10",
  code: "\uD83D\uDCBB",
};

/** Return an emoji icon for a workflow category. */
export function categoryIcon(category: string | undefined): string {
  return CATEGORY_ICONS[category ?? ""] ?? "\uD83D\uDD27";
}
