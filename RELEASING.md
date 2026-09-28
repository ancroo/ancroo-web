# Releasing

[.github/workflows/build.yml](.github/workflows/build.yml) lints, tests and
builds the extension on every push to `main` and every pull request. Pushing a
**tag `vX.Y.Z`** additionally creates a GitHub release and uploads the zip to
the Chrome Web Store as a **draft**. Reviewing and hitting Publish in the
developer dashboard stays manual.

## Cutting a release

1. Bump `version` in `manifest.json` and `package.json` (keeps the repo
   readable; the build itself takes the version from the tag).
2. Tag the commit: `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Approve the waiting `publish` job in the Actions tab (the `store`
   environment requires a reviewer), then publish the draft in the developer
   dashboard.

The version in the built manifest comes from `git describe` (see
`vite.config.ts`), not from `manifest.json`. A tag that is not exactly
`vX.Y.Z` would build as `0.0.0`, so the workflow compares the tag with
`dist/manifest.json` and stops before anything is released.

## Store credentials

The upload talks to the store API directly with `curl`
([.github/scripts/cws-token.sh](.github/scripts/cws-token.sh)), so no npm
package ever sees the credentials. They live on the **`store` environment**
rather than repo-wide (Settings → Environments → `store`):

| Environment secret  | Where it comes from                                |
| ------------------- | -------------------------------------------------- |
| `CWS_CLIENT_ID`     | Google Cloud OAuth client of the publisher account |
| `CWS_CLIENT_SECRET` | same OAuth client                                  |
| `CWS_REFRESH_TOKEN` | granted once by the publisher account, see below   |

| Environment variable | Value                              |
| -------------------- | ---------------------------------- |
| `CWS_EXTENSION_ID`   | `jeaaomlligaaoohplachpimjgopjmfim` |

The item id is a **variable, not a secret**: it is public in the store URL, the
README and the About panel, so masking it protects nothing, while hiding it
makes a wrong id indistinguishable from a wrong account in the logs. Until it
has been moved, the workflows fall back to a repo secret of the same name.

The same OAuth client and refresh token serve every extension of the publisher
account; only `CWS_EXTENSION_ID` is per extension.

To check the credentials without uploading anything, run **Verify Store
Credentials** from the Actions tab. It exchanges the refresh token and reads the
item's status. `uploadState: NOT_FOUND` there is normal: it describes the last
upload, and means no draft is pending. What proves access is the store
returning the item's `id` and `crxVersion`.

### Getting a refresh token

1. <https://developers.google.com/oauthplayground/> → gear icon → tick **Use
   your own OAuth credentials**, paste client id and secret. _Access type_ must
   be **Offline**, or Google returns no refresh token at all.
2. Under _Input your own scopes_ enter exactly
   `https://www.googleapis.com/auth/chromewebstore` and authorise.
3. Sign in with the **Google account that owns the listing**. Any other account
   yields a technically valid token that cannot see the extension.
4. _Exchange authorization code for tokens_ → copy the refresh token.

Refresh tokens stay valid until revoked. Revoke unused ones at
<https://myaccount.google.com/connections>.

## Why an environment, and not repo secrets

Whoever holds the refresh token can push an update to every install of the
extension, and this extension stores its users' LLM API keys. Repo secrets are
offered to every job in every workflow; environment secrets only to a job that
names the environment, and the environment can be restricted to release tags.
These settings make that real, and all live in the repo settings (already set
up):

- **Settings → Environments → `store` → Required reviewers:** every job that
  uses the environment waits for a maintainer's approval, so a pushed tag
  alone never reaches the store.
- **Settings → Environments → `store` → Deployment branches and tags:**
  _Selected branches and tags_: the tag pattern `v*` for releases, plus the
  branch `main` so Verify Store Credentials can run.
- **Settings → Rules → Rulesets → "Protect release tags":** `v*` tags cannot
  be deleted or moved once pushed.

Worth having alongside: 2FA on the GitHub account and on the Google developer
account, and rotating the refresh token if it was ever pasted anywhere but the
secret store.
