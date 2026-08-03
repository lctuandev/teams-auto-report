type Window = { count: number; startedAt: number };
const windows = new Map<string, Window>();
const WINDOW_MS = 60_000;
const MAX_MUTATIONS = 30;

export function consumeMutationLimit(key: string, now = Date.now()) {
  const previous = windows.get(key);
  const window = !previous || now - previous.startedAt >= WINDOW_MS ? { count: 0, startedAt: now } : previous;
  window.count += 1;
  windows.set(key, window);
  return { allowed: window.count <= MAX_MUTATIONS, retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + WINDOW_MS - now) / 1000)) };
}

export function mutationKey(request: Request, userId: string) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `${userId}:${address}`;
}
