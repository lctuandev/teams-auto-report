import "server-only";

import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { resolveInsideDataRoot } from "@/lib/data-root";
import { resourceIdSchema } from "@/lib/schemas/common";

const RETRY_MS = 40;
const TIMEOUT_MS = 3_000;
const MEMBER_STALE_MS = 4 * 60 * 60 * 1_000;
const GROUP_STALE_MS = 30_000;

export class ResourceLockedError extends Error {}

export async function withResourceLock<T>(type: "member" | "group" | "account", resourceId: string, operation: () => Promise<T>) {
  const id = resourceIdSchema.parse(resourceId);
  const locksRoot = resolveInsideDataRoot(".locks");
  const lockPath = resolveInsideDataRoot(".locks", type === "member" ? `member-${id}.lock` : `ui-${type}-${id}.lock`);
  const staleMs = type === "member" ? MEMBER_STALE_MS : GROUP_STALE_MS;
  await mkdir(locksRoot, { recursive: true });
  const deadline = Date.now() + TIMEOUT_MS;

  while (true) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
        return await operation();
      } finally {
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const lockStat = await stat(lockPath).catch(() => null);
      if ((await isLockOwnerDead(lockPath)) || (lockStat && Date.now() - lockStat.mtimeMs > staleMs)) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline) throw new ResourceLockedError(`${type} '${id}' is currently being updated`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  }
}

export async function isLockOwnerDead(lockPath: string) {
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as { pid?: unknown };
    if (!Number.isInteger(lock.pid) || Number(lock.pid) <= 0) return false;
    process.kill(Number(lock.pid), 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}
