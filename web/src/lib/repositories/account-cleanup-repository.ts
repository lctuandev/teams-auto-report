import "server-only";

import { readFile, rm, unlink } from "node:fs/promises";
import { resolveInsideDataRoot } from "@/lib/data-root";
import { resourceIdSchema } from "@/lib/schemas/common";
import { isLockOwnerDead, withResourceLock } from "./resource-lock";

export class AccountBusyError extends Error {}

export class AccountCleanupRepository {
  async remove(memberIdInput: string) {
    const memberId = resourceIdSchema.parse(memberIdInput);
    return withResourceLock("account", "onboarding-registry", async () => {
      const lockPaths = [
        resolveInsideDataRoot(".locks", `member-${memberId}.lock`),
        resolveInsideDataRoot(".locks", `browser-renew-${memberId}.lock`),
      ];

      for (const lockPath of lockPaths) {
        const exists = await readFile(lockPath, "utf8").then(() => true).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        });
        if (!exists) continue;
        if (!(await isLockOwnerDead(lockPath))) throw new AccountBusyError(`Account '${memberId}' is currently running`);
        await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }

      await rm(resolveInsideDataRoot("users", memberId), { recursive: true, force: true });
      await rm(resolveInsideDataRoot(".browser-profiles", memberId), { recursive: true, force: true });
      return { memberId };
    });
  }
}
