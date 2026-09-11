import { getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";

/**
 * Anonymous, browser-scoped learner identity. No accounts, no login: a random
 * id in an http-only cookie, used to scope every attempt at both the service
 * and the database (RLS) layer. It is never exposed in the UI.
 */
const COOKIE = "lld_learner";
const VALID = /^[0-9a-f-]{8,64}$/i;
const YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Placeholder owner used for reads before the learner has any attempts. */
export const UNKNOWN_LEARNER = "unknown-learner-0000";

export function readLearnerId(): string | null {
  try {
    const value = getRequestHeader("x-learner-id") ?? getCookie(COOKIE);
    return value && VALID.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Never throws: reads fall back to an id that owns nothing. */
export const learnerIdForRead = (): string => readLearnerId() ?? UNKNOWN_LEARNER;

/** Used by writes: creates and stores the identity on first use. */
export function requireLearnerId(): string {
  const existing = readLearnerId();
  if (existing) return existing;
  const id = crypto.randomUUID();
  setCookie(COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: YEAR_SECONDS,
  });
  return id;
}
