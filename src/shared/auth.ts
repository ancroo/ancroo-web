/** OAuth2 PKCE authentication for the browser extension. */

/** Stored token data. */
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  /** Unix timestamp (ms) when the access token expires. */
  expires_at: number;
}

/** OIDC configuration returned by the backend. */
interface OidcConfig {
  authorization_url: string;
  client_id: string;
  scopes: string;
}

const AUTH_STORAGE_KEY = "auth";

/** Margin (ms) before expiry to trigger a refresh. */
const REFRESH_MARGIN_MS = 60_000;

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Token response validation
// ---------------------------------------------------------------------------

/** Parse and validate a token response from the backend. */
function parseTokenResponse(data: Record<string, unknown>): AuthTokens {
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("Invalid token response: missing access_token");
  }
  if (typeof data.refresh_token !== "string" || !data.refresh_token) {
    throw new Error("Invalid token response: missing refresh_token");
  }
  if (typeof data.expires_in !== "number" || data.expires_in <= 0) {
    throw new Error("Invalid token response: missing or invalid expires_in");
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

async function storeTokens(tokens: AuthTokens): Promise<void> {
  await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: tokens });
}

async function loadTokens(): Promise<AuthTokens | null> {
  const stored = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  return (stored[AUTH_STORAGE_KEY] as AuthTokens | undefined) ?? null;
}

/** Clear stored tokens. */
export async function logout(): Promise<void> {
  await chrome.storage.local.remove(AUTH_STORAGE_KEY);
}

/** Check whether tokens are stored (does not verify validity). */
export async function isLoggedIn(): Promise<boolean> {
  return (await loadTokens()) !== null;
}

/** Check if the backend requires authentication. */
export async function isAuthRequired(backendUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${backendUrl}/api/v1/auth/status`);
    if (!res.ok) return true;
    const data = await res.json();
    return data.auth_enabled === true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Login (PKCE via chrome.identity)
// ---------------------------------------------------------------------------

/** Run the full PKCE login flow via a browser popup.
 *
 *  1. Fetch OIDC config from the backend.
 *  2. Open Keycloak login popup via `chrome.identity.launchWebAuthFlow`.
 *  3. Exchange the authorization code for tokens via the backend.
 *  4. Store tokens in `chrome.storage.local`.
 */
export async function login(backendUrl: string): Promise<AuthTokens> {
  // 1. Discover OIDC config from backend
  const configRes = await fetch(`${backendUrl}/api/v1/auth/oidc-config`);
  if (!configRes.ok) {
    throw new Error(`Failed to fetch OIDC config: ${configRes.status}`);
  }
  const oidcConfig: OidcConfig = await configRes.json();

  // 2. Generate PKCE pair + state
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  const redirectUri = chrome.identity.getRedirectURL();

  // 3. Build authorization URL
  const authUrl = new URL(oidcConfig.authorization_url);
  authUrl.searchParams.set("client_id", oidcConfig.client_id);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", oidcConfig.scopes);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // 4. Open browser popup for Keycloak login
  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });

  if (!responseUrl) {
    throw new Error("Login was cancelled.");
  }

  // 5. Extract code & state from redirect URL
  const params = new URL(responseUrl).searchParams;
  const code = params.get("code");
  const returnedState = params.get("state");

  if (!code) {
    const error = params.get("error_description") || params.get("error") || "No code received";
    throw new Error(`Login failed: ${error}`);
  }
  if (returnedState !== state) {
    throw new Error("Login failed: state mismatch (possible CSRF).");
  }

  // 6. Exchange code for tokens via backend
  const tokenRes = await fetch(`${backendUrl}/api/v1/auth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      state,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Token exchange failed: ${body}`);
  }

  const tokenData = await tokenRes.json();
  const tokens = parseTokenResponse(tokenData);
  await storeTokens(tokens);
  return tokens;
}

// ---------------------------------------------------------------------------
// Token retrieval (with automatic refresh)
// ---------------------------------------------------------------------------

/** Get a valid access token, refreshing if necessary.
 *
 *  Returns `null` if no tokens are stored (user must log in).
 */
export async function getAccessToken(backendUrl: string): Promise<string | null> {
  const tokens = await loadTokens();
  if (!tokens) return null;

  // Still valid (with margin)?
  if (Date.now() < tokens.expires_at - REFRESH_MARGIN_MS) {
    return tokens.access_token;
  }

  // Try to refresh
  try {
    const refreshed = await refreshTokens(backendUrl, tokens.refresh_token);
    return refreshed.access_token;
  } catch {
    // Refresh failed — clear tokens so the user is prompted to re-login
    await logout();
    return null;
  }
}

async function refreshTokens(
  backendUrl: string,
  refreshToken: string,
): Promise<AuthTokens> {
  const res = await fetch(`${backendUrl}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  const tokens = parseTokenResponse(data);
  await storeTokens(tokens);
  return tokens;
}
