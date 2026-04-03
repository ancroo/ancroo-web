# Changelog

All notable changes to the Ancroo browser extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Direct Mode — use LLM APIs (OpenAI, Anthropic, Gemini, Ollama, OpenRouter) without a backend
- Workflow category selector in editor
- Default API endpoint display in provider settings
- Privacy policy, store listing, and promotional assets for Chrome Web Store
- Localization support (`_locales/en`)

### Fixed

- Gemini API key moved from URL parameter to request header (security)
- Selector validation to prevent arbitrary DOM access in content script

### Changed

- Updated all dependencies and fixed known vulnerabilities

## [0.2.0] — 2026-03-20

### Added

- Collapsible workflow categories in side panel
- `page_html` input source for full page capture
- `insert_before`, `insert_after`, `download_file`, `manual_input`, `side_panel_only` output actions
- `fill_fields` action for writing results back into form fields
- HTML capture alongside text from selections
- Improved workflow execution feedback and error handling

### Fixed

- Selection handling for textarea/input and focus loss
- Empty result feedback in side panel

### Changed

- Adapted extension to Three-Area backend API
- Migrated GitHub URLs to ancroo organization

## [0.1.0] — 2026-03-05

### Added

- Initial release
- Manifest V3 Chrome extension with side panel UI
- Backend Mode — connect to self-hosted Ancroo Stack
- Push-to-talk audio recording with Whisper STT
- Context menu integration ("Run with Ancroo")
- Keyboard shortcuts (hotkeys) for workflows
- Clipboard read/write support
- Execution history (last 50 entries)
- OAuth2 PKCE authentication for multi-user backends

[Unreleased]: https://github.com/ancroo/ancroo-web/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ancroo/ancroo-web/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ancroo/ancroo-web/releases/tag/v0.1.0
