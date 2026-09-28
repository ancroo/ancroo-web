#!/usr/bin/env bash
#
# cws-token.sh — exchange the Chrome Web Store refresh token for a short-lived
# access token, printed on stdout. Diagnostics and workflow commands go to
# stderr, so callers can do: ACCESS_TOKEN="$(.github/scripts/cws-token.sh)"
#
# Reads CLIENT_ID, CLIENT_SECRET and REFRESH_TOKEN from the environment.
# Shared by the release upload and the read-only credential check, so both
# report the same failures the same way.

set -euo pipefail

command -v jq >/dev/null 2>&1 || { echo "::error::'jq' is required" >&2; exit 1; }

# `gh secret set < file` happily stores a trailing newline, which Google then
# rejects as an invalid grant. Report it (never the value itself) and carry on
# with the trimmed version.
for NAME in CLIENT_ID CLIENT_SECRET REFRESH_TOKEN; do
  RAW="${!NAME-}"
  if [ -z "$RAW" ]; then
    echo "::error::CWS_${NAME} is not set." >&2
    exit 1
  fi
  TRIMMED="$(printf '%s' "$RAW" | tr -d '[:space:]')"
  if [ "${#RAW}" -ne "${#TRIMMED}" ]; then
    echo "::warning::CWS_${NAME} contains whitespace (${#RAW} chars vs ${#TRIMMED} trimmed) — re-set it without the trailing newline." >&2
  fi
  declare "$NAME=$TRIMMED"
done

# --data-urlencode rather than -d: a rotated secret may well contain characters
# that are not safe in a form body.
RESPONSE="$(curl -sS -X POST https://oauth2.googleapis.com/token \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}" \
  --data-urlencode "refresh_token=${REFRESH_TOKEN}" \
  --data-urlencode "grant_type=refresh_token")"

ACCESS_TOKEN="$(printf '%s' "$RESPONSE" | jq -r '.access_token // empty')"
if [ -z "$ACCESS_TOKEN" ]; then
  ERROR="$(printf '%s' "$RESPONSE" | jq -r '.error // "unknown"')"
  echo "::error::Token exchange failed: ${ERROR} ($(printf '%s' "$RESPONSE" | jq -r '.error_description // "no description"'))" >&2
  case "$ERROR" in
    invalid_client) echo "::error::The client id or client secret is wrong — check them against the OAuth client in the Google Cloud Console." >&2 ;;
    invalid_grant)  echo "::error::The refresh token is wrong, expired, revoked, or was issued for a different OAuth client than CWS_CLIENT_ID." >&2 ;;
  esac
  exit 1
fi

# Not a repo secret, so Actions would not mask it on its own.
echo "::add-mask::$ACCESS_TOKEN" >&2
echo "Token exchange OK — client id, client secret and refresh token are valid." >&2

printf '%s\n' "$ACCESS_TOKEN"
