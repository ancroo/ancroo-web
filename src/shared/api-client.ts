import type {
  Workflow,
  CollectionRecipe,
  ExecuteWorkflowResponse,
  InputDataPacket,
  User,
  HotkeyMapping,
} from "./types";
import { getSettings } from "./settings";
import { getAccessToken } from "./auth";

/** Get the API base URL from settings. */
async function getApiBase(): Promise<string> {
  const settings = await getSettings();
  return `${settings.backend_url}/api/v1`;
}

/** Get the backend root URL (without /api/v1). */
async function getBackendUrl(): Promise<string> {
  const settings = await getSettings();
  return settings.backend_url;
}

/** Make an authenticated API request using Bearer token. */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const apiBase = await getApiBase();
  const backendUrl = await getBackendUrl();
  const token = await getAccessToken(backendUrl);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(
        "Not logged in. Please sign in to your Ancroo server first."
      );
    }
    const body = await response.text();
    const lower = body.toLowerCase();

    // Parse known error patterns into user-friendly messages
    if (
      lower.includes("model") &&
      (lower.includes("not found") || lower.includes("does not exist"))
    ) {
      const modelMatch =
        body.match(/"model":\s*"([^"]+)"/i) ||
        body.match(/model[:\s]+(\S+)/i);
      const modelName = modelMatch?.[1] ?? "unknown";
      throw new Error(
        `Model "${modelName}" is not installed in Ollama. ` +
          `Pull it first: docker exec ollama ollama pull ${modelName}`
      );
    }
    if (response.status === 504 || lower.includes("timeout")) {
      throw new Error(
        "The AI model took too long to respond. Try a smaller model or shorter input text."
      );
    }
    if (response.status === 503 || lower.includes("service unavailable")) {
      throw new Error(
        "The backend service is not available. Check that all containers are running."
      );
    }

    // FastAPI returns {"detail": "..."} for HTTP errors — extract it
    const detail = extractDetail(body);
    throw new Error(detail ?? `API error ${response.status}: ${body}`);
  }

  return response.json();
}

/** Try to extract a human-readable detail from a JSON error body. */
function extractDetail(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.detail === "string") return parsed.detail;
    if (typeof parsed.error === "string") return parsed.error;
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // Not JSON — ignore
  }
  return null;
}

/** Normalize a recipe so that `collect` is always a string array.
 *  The backend may return collect as an array or as {sources: [...]}.
 */
function normalizeRecipe(recipe: unknown): Workflow["recipe"] {
  if (!recipe || typeof recipe !== "object") return null;
  const r = recipe as Record<string, unknown>;
  let collect: CollectionRecipe["collect"] = [];
  if (Array.isArray(r.collect)) {
    collect = r.collect;
  } else if (r.collect && typeof r.collect === "object" && Array.isArray((r.collect as Record<string, unknown>).sources)) {
    collect = (r.collect as Record<string, unknown>).sources as CollectionRecipe["collect"];
  }
  return {
    collect,
    form_fields: Array.isArray(r.form_fields) ? r.form_fields : (r.collect as Record<string, unknown>)?.form_fields as typeof undefined,
    output_fields: Array.isArray(r.output_fields) ? r.output_fields : (r.collect as Record<string, unknown>)?.output_fields as typeof undefined,
    file_config: (r.file_config ?? (r.collect as Record<string, unknown>)?.file) as typeof undefined,
  };
}

/** List all accessible workflows. */
export async function listWorkflows(): Promise<Workflow[]> {
  const data = await apiFetch<{ workflows: Workflow[] }>("/workflows");
  return data.workflows.map((w) => ({
    ...w,
    recipe: normalizeRecipe(w.recipe),
  }));
}

/** Execute a workflow with the given input. */
export async function executeWorkflow(
  slug: string,
  inputData: InputDataPacket
): Promise<ExecuteWorkflowResponse> {
  return apiFetch<ExecuteWorkflowResponse>(`/workflows/${slug}/execute`, {
    method: "POST",
    body: JSON.stringify({
      input_data: inputData,
      client_version: __APP_VERSION__,
      client_platform: "chrome-extension",
    }),
  });
}

/** Execute a workflow with a file upload (multipart/form-data). */
export async function executeWorkflowWithFile(
  slug: string,
  inputData: InputDataPacket,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ExecuteWorkflowResponse> {
  const apiBase = await getApiBase();
  const backendUrl = await getBackendUrl();
  const token = await getAccessToken(backendUrl);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("input_data", JSON.stringify(inputData));
  formData.append("client_version", __APP_VERSION__);
  formData.append("client_platform", "chrome-extension");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase}/workflows/${slug}/execute-upload`);
    xhr.timeout = 600000;

    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else if (xhr.status === 401) {
        reject(new Error("Not logged in. Please sign in to your Ancroo server first."));
      } else {
        const detail = extractDetail(xhr.responseText);
        reject(new Error(detail ?? `API error ${xhr.status}: ${xhr.responseText}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));

    xhr.send(formData);
  });
}

/** Get current user info. */
export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>("/auth/me");
}

/** Fetch the user's hotkey settings (effective hotkey per workflow). */
export async function fetchHotkeySettings(): Promise<HotkeyMapping[]> {
  return apiFetch<HotkeyMapping[]>("/workflows/hotkeys/settings");
}
