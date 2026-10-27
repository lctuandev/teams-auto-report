import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { CatchUpMember } from "@/lib/catch-up";
import { resolveInsideDataRoot } from "@/lib/data-root";
import { catchUpQueueSchema, type CatchUpItem } from "@/lib/schemas/catch-up";
import { resourceIdSchema } from "@/lib/schemas/common";
import { memberConfigSchema, memberStateSchema } from "@/lib/schemas/member";
import { atomicWriteJson, readJson } from "./json-file";
import { MemberRepository } from "./member-repository";
import { withResourceLock } from "./resource-lock";

const MAX_KEPT_ITEMS = 200;

export class CatchUpRepository {
  async list(groupId: string): Promise<CatchUpItem[]> {
    const id = resourceIdSchema.parse(groupId);
    const queue = await this.read(id);
    return [...queue.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // Queuing the same group and date twice while the first request is still
  // active returns the existing request instead of reporting twice.
  async enqueue(groupId: string, date: string, requestedBy: string) {
    const id = resourceIdSchema.parse(groupId);
    return withResourceLock("group", id, async () => {
      const queue = await this.read(id);
      const active = queue.items.find((item) => item.date === date && (item.status === "queued" || item.status === "processing"));
      if (active) return { item: active, created: false };

      const now = new Date().toISOString();
      const item: CatchUpItem = {
        id: `catch_up_${crypto.randomUUID()}`,
        groupId: id,
        date,
        status: "queued",
        requestedBy,
        createdAt: now,
        updatedAt: now,
        results: [],
      };
      queue.items.push(item);
      const removable = queue.items
        .filter((candidate) => candidate.status === "completed" || candidate.status === "failed")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const overflow = new Set(removable.slice(0, Math.max(0, queue.items.length - MAX_KEPT_ITEMS)).map((candidate) => candidate.id));
      queue.items = queue.items.filter((candidate) => !overflow.has(candidate.id));

      await atomicWriteJson(this.path(id), catchUpQueueSchema.parse(queue));
      return { item, created: true };
    });
  }

  async listGroupMembers(groupId: string): Promise<CatchUpMember[]> {
    const id = resourceIdSchema.parse(groupId);
    const members = (await new MemberRepository().listSafe()).filter((member) => member.groupId === id);
    return Promise.all(members.map(async (member) => {
      const [config, state] = await Promise.all([
        readJson(resolveInsideDataRoot("users", member.id, "config.json"), memberConfigSchema),
        readJson(resolveInsideDataRoot("users", member.id, "state.json"), memberStateSchema),
      ]);
      const excludeCompleted = config.report.excludeCompletedTasks === true;
      return {
        id: member.id,
        displayName: member.displayName,
        enabled: member.enabled,
        postedDates: Object.entries(state.postedReports)
          .filter(([, value]) => (value as { checked?: unknown } | null)?.checked === true)
          .map(([date]) => date),
        skipDates: stringDates(config.report.skipDates),
        extraWorkDates: stringDates(config.report.extraWorkDates),
        reportableTaskCount: config.tasks.filter((task) => !excludeCompleted || task.startPercent < 100).length,
      };
    }));
  }

  // Dates whose parent post the bot has already found or created. A date that
  // is missing here may still exist in Teams; the bot searches before failing.
  async knownParentPostDates(groupId: string, threadId: string, dates: string[]) {
    const id = resourceIdSchema.parse(groupId);
    let cache: Record<string, unknown> = {};
    try {
      cache = JSON.parse(await readFile(resolveInsideDataRoot(".state", "parent-posts.json"), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return dates.filter((date) => {
      const key = createHash("sha256").update([id, threadId, date].join("|")).digest("hex");
      return Boolean((cache[key] as { parentMessageId?: unknown } | undefined)?.parentMessageId);
    });
  }

  private path(groupId: string) {
    return resolveInsideDataRoot(".state", "catch-up-queues", `${groupId}.json`);
  }

  private async read(groupId: string) {
    try {
      const raw = await readFile(this.path(groupId), "utf8");
      return catchUpQueueSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return catchUpQueueSchema.parse({ version: 1, items: [] });
      }
      throw error;
    }
  }
}

function stringDates(value: unknown) {
  return Array.isArray(value) ? value.filter((date): date is string => typeof date === "string") : [];
}
