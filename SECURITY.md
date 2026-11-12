# Security Policy

## Supported versions

Fixes go to the latest version only — the current release on the Chrome Web Store
and `main`. There are no release branches.

## How your data is handled

- **API keys and settings** are stored in `chrome.storage.local`, which is sandboxed
  per extension and not accessible by websites or other extensions. The extension's
  own content scripts, which run inside web pages, are denied access as well. The
  storage is not encrypted on disk — anyone with access to your browser profile can
  read it.
- **Text you send** goes only to the LLM provider you configure. Ancroo Web collects
  no data — see [PRIVACY.md](PRIVACY.md).

## Reporting a vulnerability

Please report vulnerabilities through [GitHub's private vulnerability reporting](https://github.com/ancroo/ancroo-web/security/advisories/new),
not as a public issue.

You can expect a first answer within a few days. A confirmed vulnerability is fixed
as soon as possible.
