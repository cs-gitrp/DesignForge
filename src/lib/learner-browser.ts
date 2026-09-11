const STORAGE_KEY = "lld_learner";
const VALID = /^[0-9a-f-]{8,64}$/i;

/**
 * Returns the stable anonymous learner id used by browser server-function
 * requests. Storage works inside hosted preview frames where cookies may be
 * unavailable.
 */
export function ensureBrowserLearner(): string {
  if (typeof window === "undefined") return "unknown-learner-0000";
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing && VALID.test(existing)) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}
