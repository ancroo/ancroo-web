# Security Policy

For the overall Ancroo security policy, roadmap, and Phase 1 limitations, see the [central security policy](https://github.com/ancroo/ancroo/blob/main/SECURITY.md).

## Extension-Specific Notes

- The extension requests the minimum Chrome permissions needed for its features (active tab, side panel, context menus, clipboard).
- All communication with the backend is via HTTP(S) — no data is sent to third parties.
- Execution history is stored locally in Chrome storage (last 50 results).
- When authentication is enabled on the backend, the extension uses OAuth2 PKCE (no client secret stored).

## Reporting a Vulnerability

Please report security vulnerabilities through [GitHub's private vulnerability reporting](https://github.com/ancroo/ancroo-web/security/advisories/new).

Do not open a public issue for security vulnerabilities.
