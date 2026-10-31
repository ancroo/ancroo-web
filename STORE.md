# Chrome Web Store Submission — Ancroo

This file contains the text and justifications to paste into the Chrome Web
Store Developer Dashboard. It is documentation for the submitter and is not
shipped as part of the extension's runtime.

Every block meant for the dashboard is in a fenced code block and is verbatim
paste-ready: no quote markers, no line wrapping — copy the whole block as is.

---

## Store listing

**Name:** comes from `_locales/en/messages.json` (`extensionName`) — nothing to
enter.

**Category:** Productivity → Workflow & Planning

**Summary (short description, max 132 characters):** also from
`_locales/en/messages.json` (`extensionDescription`).

**Detailed description:**

```text
Ancroo is an AI prompt launcher for your browser. Select text on any page or type input manually, fire an AI prompt, and get results right where you need them. No tab switching. No copy-paste.

SEE HOW IT WORKS

A quick overview of Ancroo in action:

→ https://www.youtube.com/watch?v=2czqRFo1qpU

SETUP IN SECONDS

Connect to OpenAI, Anthropic, Google Gemini, Ollama, OpenRouter, or any OpenAI-compatible API. Add your API key, pick a default model, and you're ready. To get you going, eleven ready-made actions are set up instantly — a starting point you can edit, rename, or replace with your own:

- Summarize
- Translate to English
- Rewrite Formal
- Explain
- Fix Grammar
- Fix Capitalization
- Draft Reply
- Polite Decline
- Thank-You Note
- Convert to Markdown
- Ask AI

WATCH THE SETUP

New here? This short video walks you through installing Ancroo and connecting your first provider:

→ https://www.youtube.com/watch?v=ZObrvL4vdXo

MAKE IT YOURS

These eleven are just examples. The real power is building your own: write a custom prompt and system prompt, pick the model (the editor auto-detects available models from your provider), choose how input and output work, and assign a hotkey — for exactly the tasks you do every day.

TRY THE STARTER ACTIONS

Once installed, open our practice page and put the starter actions to work right away. Select sample text, form fields, code, or example emails, open the side panel, and run an action to see Fix Grammar, Translate, Draft Reply, and more in action — including replace-in-place and show-in-panel outputs.

→ https://ancroo.github.io/ancroo-web/

POINT. PROMPT. DONE.

- Side panel UI — click the extension icon or press Alt+Shift+Y to open
- Hotkeys — select text, trigger an action with a keyboard shortcut, get AI results
- Flexible input — pick one input per action: Selection (formatted), Selection (plain text), Whole page, or Manual entry. Your choice fills the {text} variable in the prompt; {url} and {title} are always available too
- Output actions — replace selected text, copy to clipboard, insert before/after, or show in panel
- Follow-up messages — after a manual-entry action shows a result, send another message right from the result view to iterate, no navigating back
- Action categories — organize actions into named categories with icons; collapsible groups in the side panel
- Execution history — last 50 results stored locally
- Backup & restore — export actions, categories, and provider settings to a JSON file; import on any device

LLM PROVIDERS

- OpenAI
- Anthropic
- Google Gemini
- Ollama — run models locally on your machine
- OpenRouter — access 200+ models via a single API key
- Any OpenAI-compatible endpoint

FREE — BRING YOUR OWN KEY

Ancroo itself is free. There's no subscription and no Ancroo account — you simply connect your own LLM provider and pay that provider directly for the API usage you choose. Prefer to keep everything on your machine? Run a local model with Ollama at no cost at all.

Stop switching tabs and pasting into chatbots — install Ancroo and keep AI one keystroke away, right where you already work.

PRIVACY

Privacy first: Ancroo collects no analytics, telemetry, or personal data. All settings and history stay in your browser. Data is only sent to LLM providers you configure.

OPEN SOURCE

Free and open source (MIT licence) — the full source is on GitHub, so you can read exactly what it does before you install it.

SUPPORT

Questions or feedback? Email support@ancroo.com — happy to help.

Source code, issues and licence:
https://github.com/ancroo/ancroo-web

Privacy policy:
https://github.com/ancroo/ancroo-web/blob/main/PRIVACY.md
```

Note: the description is plain text — URLs are shown but **not** clickable. The
clickable links in the listing come from the dedicated URL fields below, so fill
in both.

**Additional fields (store listing → Additional fields):**

| Field                       | Value                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Homepage URL                | `https://github.com/ancroo/ancroo-web`                                                        |
| Support URL                 | `https://github.com/ancroo/ancroo-web/issues`                                                 |
| Contact email (Account tab) | `support@ancroo.com` — the public address for users, never the login of the publisher account |

**Privacy policy URL:**

```text
https://github.com/ancroo/ancroo-web/blob/main/PRIVACY.md
```

---

## Single purpose (required field)

```text
Ancroo runs the user's own AI prompts on text from the current page — selected text, the whole page or manual input — through an LLM provider the user configures, and shows the result in the side panel or inserts it into the page.
```

---

## Permission justifications

Keep this section in sync with `manifest.json` and the referenced code. If a
permission is added or removed or its use changes, update both the dashboard and
this file in the same change. Paste each justification into the matching field in
the dashboard (limit: 1000 characters each).

### `activeTab`

**Code:** content-script messaging + active-tab context (`src/background/service-worker.ts`, `src/content/`)

```text
Required to read the currently active tab's URL and title, which are used as context variables in AI actions (e.g., "Summarize this page"). Also used to send messages to the content script in the active tab for text selection and result insertion.
```

### `sidePanel`

**Code:** `src/sidepanel/` (`manifest.json` → `side_panel`)

```text
The entire extension UI is rendered in a Chrome side panel. Users open it to select actions, view results, configure settings, and browse execution history.
```

### `storage`

**Code:** `chrome.storage.local` throughout (`src/background/service-worker.ts`, `src/shared/local-actions.ts`, execution history write in `src/sidepanel/App.tsx` → `executeTextAction`)

```text
Stores all user data locally in chrome.storage.local: extension settings, LLM provider configuration, API keys, action definitions, hotkey bindings, and execution history. No data is synced or sent to external servers by the extension itself.
```

### `scripting`

**Code:** `src/shared/tab-messaging.ts` → `injectContentScript` (fallback only; primary delivery is the manifest `content_scripts` declaration)

```text
The content script (which reads selected text and inserts action results back into editable fields) normally ships declaratively via the manifest. chrome.scripting.executeScript is used only as a recovery fallback: tabs that were already open before the extension was installed or updated do not have the declarative content script, so it is injected on demand the first time the user runs an action on such a tab. Without this, users would have to reload every open tab after installing or updating the extension.
```

### `clipboardWrite`

**Code:** `copy_to_clipboard` output type (`src/shared/types.ts`), `src/content/index.ts` → `WRITE_CLIPBOARD` handler, `src/sidepanel/App.tsx` → `copyResultToClipboard`

```text
Actions can copy results to the clipboard as an output type. When an action is configured with the "copy_to_clipboard" output, the AI-processed result is written to the clipboard so the user can paste it elsewhere. The clipboard is written only for this explicitly configured output — never as a side effect of other output types.
```

### `downloads`

**Code:** backup export only — `src/shared/backup.ts` → `exportBackup` (`chrome.downloads.download(...)`)

```text
Used only by the backup feature. When the user clicks Export in settings, the extension serializes their actions, categories, and provider settings to a JSON file and saves it via chrome.downloads.download(). Downloads are triggered only on explicit user action; no remote content is downloaded.
```

### `declarativeNetRequestWithHostAccess`

**Code:** `src/shared/llm/ollama.ts` (MODIFY_HEADERS rule overriding `Origin`)

```text
Required to override the Origin request header for local Ollama instances. Ollama's built-in CORS policy rejects browser requests by default. This permission allows the extension to modify the Origin header so users can connect to their local Ollama server without disabling Ollama's security settings.
```

### Host permissions

**Code:** `manifest.json` → `host_permissions` / `optional_host_permissions` / `content_scripts` (matches + `all_frames` + `match_origin_as_fallback`); runtime requests in `src/shared/host-permission.ts`

```text
The extension sends user-provided text to LLM APIs for AI processing. Fixed host permissions cover the most common providers: api.openai.com (OpenAI), api.anthropic.com (Anthropic), generativelanguage.googleapis.com (Google Gemini), openrouter.ai (OpenRouter), and localhost/127.0.0.1 (local models like Ollama). Custom provider URLs are handled via optional_host_permissions and requested at runtime only when the user configures them. The content script runs on all http/https pages and all their frames because users can trigger actions (via hotkey or side panel) on text they select on any website — including selections inside embedded editor frames, as used by many webmail and rich-text editors. It only reads the current selection and inserts results when the user explicitly runs an action, and never transmits page content anywhere on its own.
```

---

## Remote code

```text
No. Ancroo contains no remote code. All logic ships inside the package. No external scripts are loaded or executed.
```

## Data usage disclosures (Privacy practices tab)

**Read this before ticking the boxes.** "Collect" here does _not_ mean "sent to
the developer". Google's [User Data
FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
requires disclosure even when data is processed or stored only locally on the
user's device. So a category gets **Yes** if the extension _touches_ that data
at all. "It never leaves the device" belongs in the certifications below and in
[PRIVACY.md](PRIVACY.md), not in a **No** here.

Answer the "What user data do you collect" checklist as follows:

- Personally identifiable information: **No**
- Health information: **No**
- Financial and payment information: **No**
- **Authentication information: Yes** — the user's LLM API keys are stored in
  `chrome.storage.local` and sent to the matching provider.
- Personal communications: **No** _(no mail or chat is read on its own; text only
  reaches an action when the user selects it, which Website content covers)_
- Location: **No**
- Web history: **No** _(only the active tab's URL and title, as `{url}` and
  `{title}` variables of an action the user runs; no history is read or stored)_
- User activity: **No** _(the content script matches key presses against the
  user's hotkeys; it does not log clicks, scrolling or keystrokes)_
- **Website content: Yes** — selected text or the whole page is read when the
  user runs an action, and the last 50 results are kept locally.

Justification for the Website content field:

```text
Ancroo reads the text the user selects, or the whole page if the user configured the action that way, only when the user runs an action, because applying an AI prompt to that text is the extension's single purpose. The text is sent directly to the LLM provider the user configured, and the result is shown or inserted. The last 50 results are stored locally in the browser. Nothing is sent to the developer.
```

Certifications (all must be checked / true):

- ☑ I do not sell or transfer user data to third parties, outside of the
  approved use cases.
- ☑ I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

---

## Promotional images

Ready-to-upload promo tiles live in `store-assets/` (HTML sources + rendered
PNGs, not shipped inside the extension zip):

- **Small promo tile** — `store-assets/small-promo-440x280.png` (440×280)
- **Marquee promo tile** — `store-assets/marquee-1400x560.png` (1400×560)

The store rejects images that carry an alpha channel. Check before uploading and
drop it if needed:

```
identify -format '%f %wx%h %[channels]\n' store-assets/*.png
mogrify -alpha off -define png:color-type=2 store-assets/<file>.png
```

`srgb` is good, `srgba` needs the `mogrify` step.

## Screenshots

Captured from the running extension with PostReady Screenshots (format "Chrome
Web Store") and kept in `store-assets/`. Upload order in the listing follows this
list:

- `screenshot_actions.jpg` — the action list next to the demo page
- `screenshot_text-inserted.jpg` — a result inserted into the page
- `screenshot_new-action.jpg` — the action editor
- `screenshot_settings.jpg` — provider settings and backup
- `screenshot_about.jpg` — the About panel

Requirements, all met by the files above: **1280×800** (640×400 also allowed but
looks soft in the listing), 24-bit PNG **without** alpha, or JPEG. The image must
fill the frame — no transparent or empty margins. At least one is required, up to
five are allowed.

## Demo page

`docs/index.html` is the practice page for the starter actions. It is published
via **GitHub Pages** and live at `https://ancroo.github.io/ancroo-web/` — the URL
the About panel's "Try it out" link points to.

## Store listing URL

The listing is live at:

```text
https://chromewebstore.google.com/detail/ancroo/jeaaomlligaaoohplachpimjgopjmfim
```

The extension ID is therefore `jeaaomlligaaoohplachpimjgopjmfim` — that is the
value for the `CWS_EXTENSION_ID` environment variable (see
[RELEASING.md](RELEASING.md)). It is public information (it is part of the URL
above), not a credential.

## About panel links

The About panel links out to several URLs, all of them live:

- **Source / Privacy** → `github.com/ancroo/ancroo-web` (Privacy points at
  `PRIVACY.md` in it).
- **Send Feedback** → `mailto:support@ancroo.com`.
- **Demo** → GitHub Pages URL above.
- **Rate on Chrome Web Store** → the listing URL above with `/reviews` appended,
  so the link lands directly on the review form.

## Building and releasing

Build, CI upload and store credentials are documented in
[RELEASING.md](RELEASING.md).
