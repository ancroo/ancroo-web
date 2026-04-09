# ancroo-web — AI Workflow Browser Extension

**Language:** TypeScript / Preact (Manifest V3)
**License:** MIT
**Package manager:** pnpm (not npm/yarn)
**Build:** Vite + CRXJS

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest (permissions, entry points) |
| `src/background/service-worker.ts` | Hotkeys, mic permission, side panel lifecycle |
| `src/content/index.ts` | Text selection detection, hotkey interception |
| `src/content/text-inserter.ts` | Smart text insertion (contenteditable, input, textarea) |
| `src/sidepanel/App.tsx` | Main app component (state, routing) |
| `src/sidepanel/main.tsx` | Preact entry point |
| `src/sidepanel/SetupScreen.tsx` | Mode selection (backend vs direct) |
| `src/shared/api-client.ts` | Backend API calls (Bearer token auth) |
| `src/shared/auth.ts` | OAuth2 PKCE auth + token refresh |
| `src/shared/executor.ts` | Dispatch to backend or direct LLM |
| `src/shared/hotkeys.ts` | Hotkey binding system |
| `src/shared/local-workflows.ts` | Chrome storage CRUD (Direct Mode) |
| `src/shared/workflow-provider.ts` | Unified workflow listing (backend/local) |
| `src/shared/llm/` | Direct LLM adapters (OpenAI, Anthropic, Gemini, Ollama) |
| `src/shared/types.ts` | Core type definitions |
| `vite.config.ts` | Vite + CRXJS config, git version injection |

## Architecture

**Two Modes:**
- **Backend Mode:** REST API at configurable URL (default `http://localhost:8900`)
- **Direct Mode:** Direct LLM calls via adapters (no backend needed)

**Extension Contexts:**
- **Service Worker** — Hotkey handler, mic permission relay, side panel lifecycle
- **Content Script** — Text selection detection, hotkey interception, smart text insertion
- **Side Panel** — Preact UI (workflow list, execution, settings, history)

## Backend API Usage (Backend Mode)

- `GET /health` — Health check
- `GET /api/v1/workflows` — List workflows
- `POST /api/v1/workflows/{slug}/execute` — Execute with text
- `POST /api/v1/workflows/{slug}/execute-with-file` — Execute with file
- `GET /api/v1/auth/status` — Auth status
- `POST /api/v1/auth/callback` — PKCE token exchange
- `POST /api/v1/auth/refresh` — Token refresh

## Direct Mode LLM Providers

Adapters in `src/shared/llm/`:
- OpenAI (`openai.ts`) — Also OpenAI-compatible (OpenRouter)
- Anthropic (`anthropic.ts`) — Claude API
- Gemini (`gemini.ts`) — Google Gemini
- Ollama (`ollama.ts`) — Local/LAN

## UI Components (`src/sidepanel/`)

| Component | Purpose |
|-----------|---------|
| `SetupScreen` | Initial mode selection + provider config |
| `DirectModeSettings` | LLM provider CRUD |
| `WorkflowEditor` | Local workflow create/edit (Direct Mode) |
| `RecordingArea` | Push-to-talk audio (Backend Mode) |
| `FileUploadArea` | Drag-drop file upload |
| `HistoryItem` | Cached execution results |
| `AboutPanel` | Version, commit hash |

## Cross-Repo Interfaces

**Calls ancroo-backend:**
- All `/api/v1/` endpoints via fetch (REST)
- Auth via OAuth2 PKCE (when backend auth enabled)

**No direct dependency on:** ancroo-runner, ancroo-stack, ancroo-voice

## Build & Development

```bash
pnpm install
pnpm dev          # Vite dev server
pnpm build        # tsc && vite build → dist/
./build.sh        # Auto-installs pnpm, runs build
```

Load `dist/` as unpacked extension in Chrome.

Version injected from git tags (`v*`) or commit hash at build time.
