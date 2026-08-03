type LoginAttempt = { failures: number; windowStartedAt: number; blockedUntil: number };

const attempts = new Map<string, LoginAttempt>();
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 5 * 60 * 1000;
const MAX_FAILURES = 5;

export function canAttemptLogin(key: string, now = Date.now()) {
  const attempt = attempts.get(key);
  if (!attempt) return true;
  if (attempt.blockedUntil > now) return false;
  if (now - attempt.windowStartedAt > WINDOW_MS) attempts.delete(key);
  return true;
}

export function recordLoginFailure(key: string, now = Date.now()) {
  const previous = attempts.get(key);
  const attempt = !previous || now - previous.windowStartedAt > WINDOW_MS
    ? { failures: 0, windowStartedAt: now, blockedUntil: 0 }
    : previous;
  attempt.failures += 1;
  if (attempt.failures >= MAX_FAILURES) attempt.blockedUntil = now + BLOCK_MS;
  attempts.set(key, attempt);
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
