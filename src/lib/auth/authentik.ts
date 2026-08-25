export interface AuthentikUser {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  email_verified?: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
  token_type: string;
}

const AUTH_ENDPOINT = "https://api.styunlen.cn/application/o/authorize/";
const TOKEN_ENDPOINT = "https://api.styunlen.cn/application/o/token/";
const USERINFO_ENDPOINT = "https://api.styunlen.cn/application/o/userinfo/";

function getIssuer(): string {
  return process.env.AUTHENTIK_ISSUER || "https://api.styunlen.cn/application/o/enneaquest/";
}

function getClientId(): string {
  return process.env.AUTHENTIK_CLIENT_ID || "TWnYjp4wDLwA1Nr1Q928QTGlnuHPJCMMW2S1Q90t";
}

function getWpClientId(): string {
  return process.env.AUTHENTIK_WP_CLIENT_ID || "";
}

function getClientSecret(): string | undefined {
  return process.env.AUTHENTIK_CLIENT_SECRET;
}

function getAppUrl(): string {
  return process.env.APP_URL || "http://localhost:4321";
}

function getRedirectUri(): string {
  return `${getAppUrl()}/api/auth/callback`;
}

function getEndSessionEndpoint(): string {
  const issuer = getIssuer();
  const normalized = issuer.endsWith("/") ? issuer : `${issuer}/`;
  return `${normalized}end-session/`;
}

export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "openid profile email",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export function getRegistrationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "openid profile email",
    state,
    prompt: "create",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export function getLogoutUrl(): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    post_logout_redirect_uri: getAppUrl(),
  });
  return `${getEndSessionEndpoint()}?${params.toString()}`;
}

export function getWpAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getWpClientId(),
    redirect_uri: `${getAppUrl()}/api/auth/wp-callback`,
    response_type: "code",
    scope: "openid profile email",
    state,
    prompt: "none",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

// Interactive fallback for WP login. Used when the silent attempt
// (prompt=none) fails with a recoverable auth error (e.g. login_required).
// Deliberately has NO prompt parameter: Authentik's prompt=login has an
// upstream bug (goauthentik issues #12182/#18507) that forces re-authentication
// even right after a successful login, causing a redirect loop (especially with
// third-party sources like Google/GitHub). Without prompt, Authentik shows the
// login page when there's no session and silently proceeds once one exists.
export function getWpAuthorizationUrlInteractive(state: string): string {
  const params = new URLSearchParams({
    client_id: getWpClientId(),
    redirect_uri: `${getAppUrl()}/api/auth/wp-callback`,
    response_type: "code",
    scope: "openid profile email",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const clientSecret = getClientSecret();
  if (clientSecret) {
    // client_secret_basic — recommended OAuth2 method
    // Authentik expects credentials in the Authorization header
    const credentials = Buffer.from(`${getClientId()}:${clientSecret}`).toString("base64");
    headers["Authorization"] = `Basic ${credentials}`;
  } else {
    // public client — include client_id in body
    body.append("client_id", getClientId());
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const clientIdHint = getClientId().length > 8
      ? `${getClientId().slice(0, 8)}...`
      : getClientId();
    throw new Error(
      `Token exchange failed (${response.status}) ` +
      `[endpoint=${TOKEN_ENDPOINT}, client_id=${clientIdHint}]: ${errorText}`,
    );
  }

  return response.json();
}

export function parseUserFromIdToken(idToken: string): AuthentikUser | null {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(padded));
    return {
      sub: decoded.sub,
      email: decoded.email,
      name: decoded.name || decoded.preferred_username,
      preferred_username: decoded.preferred_username,
      email_verified: decoded.email_verified,
    };
  } catch {
    return null;
  }
}

export async function fetchUserInfo(
  accessToken: string,
): Promise<AuthentikUser | null> {
  try {
    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
