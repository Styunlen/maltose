import jwt from "jsonwebtoken";
import type { AuthentikUser } from "./authentik";

export interface SessionPayload {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  iat?: number;
  exp?: number;
}

function getSecret(): string {
  const secret = import.meta.env.APP_SECRET;
  if (!secret || secret === "change-me") {
    if (import.meta.env.PROD) {
      throw new Error("APP_SECRET is not configured. Set it in .env before deploying.");
    }
    console.warn("[auth] APP_SECRET is using a placeholder value — set it before deploying.");
  }
  return secret || "change-me";
}

/**
 * Create a signed session token (JWT) from Keycloak user data.
 * This is stored as an httpOnly cookie for subsequent requests.
 */
export function createSessionToken(user: AuthentikUser): string {
  const payload: SessionPayload = {
    sub: user.sub,
    email: user.email,
    name: user.name,
    preferred_username: user.preferred_username,
  };
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

/**
 * Verify and decode a session token.
 * Returns null if the token is invalid or expired.
 */
export function verifySessionToken(
  token: string,
): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as SessionPayload;
    return decoded;
  } catch {
    // Token invalid or expired
    return null;
  }
}

/**
 * Parse a session token without verifying the signature.
 * Useful for reading the expiry time. Returns null for invalid format.
 */
export function parseSessionToken(
  token: string,
): SessionPayload | null {
  try {
    const decoded = jwt.decode(token) as SessionPayload | null;
    return decoded;
  } catch {
    return null;
  }
}

export interface SessionUser {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

/**
 * Map session payload to a user object exposed to the frontend.
 */
export function sessionToUser(session: SessionPayload): SessionUser {
  return {
    sub: session.sub,
    email: session.email,
    name: session.name,
    preferred_username: session.preferred_username,
  };
}
