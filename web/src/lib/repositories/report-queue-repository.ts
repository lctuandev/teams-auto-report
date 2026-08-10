import "server-only";

import { readFile } from "node:fs/promises";
import { resolveInsideDataRoot } from "@/lib/data-root";
import { resourceIdSchema } from "@/lib/schemas/common";
import { memberStateSchema } from "@/lib/schemas/member";
import { reportQueueSchema, type ReportQueueItem } from "@/lib/schemas/report-queue";
import { atomicWriteJson, readJson } from "./json-file";
import { withResourceLock } from "./resource-lock";

export class ReportAlreadyPostedError extends Error {}

export class ReportQueueRepository {
  async list(memberId: string): Promise<ReportQueueItem[]> {
    const id = resourceIdSchema.parse(memberId);
    const queue = await this.read(id);
    return [...queue.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async enqueue(
    memberId: string,
    entries: Array<{ date: string; title: string }>,
    tasks: Array<{
      id?: string;
      title: string;
      startPercent: number;
      dailyIncrease?: number;
      dailyIncreaseRange?: [number, number];
      maxPercent: number;
    }>,
  ) {
    const id = resourceIdSchema.parse(memberId);
    return withResourceLock("member", id, async () => {
      const state = await readJson(resolveInsideDataRoot("users", id, "state.json"), memberStateSchema);
      const queue = await this.read(id);
      const now = new Date().toISOString();
      const batchId = `batch_${crypto.randomUUID()}`;
      const queuedTasks = tasks.map((task) => ({
        ...task,
        id: task.id ?? `backfill_task_${crypto.randomUUID()}`,
      }));

      for (const entry of entries) {
        if ((state.postedReports[entry.date] as { checked?: unknown } | undefined)?.checked === true) {
          throw new ReportAlreadyPostedError(`Report ${entry.date} was already posted`);
        }

        const existing = queue.items.find((item) => item.date === entry.date);
        if (existing) {
          if (existing.status === "failed") {
            existing.status = "queued";
            existing.title = entry.title;
            existing.updatedAt = now;
            if (!existing.tasks.length) {
              existing.batchId = batchId;
              existing.tasks = structuredClone(queuedTasks);
            }
            delete existing.error;
          }
          continue;
        }

        queue.items.push({
          id: `report_${crypto.randomUUID()}`,
          batchId,
          memberId: id,
          date: entry.date,
          title: entry.title,
          status: "queued",
          createdAt: now,
          updatedAt: now,
          tasks: structuredClone(queuedTasks),
        });
      }

      await atomicWriteJson(this.path(id), reportQueueSchema.parse(queue));
      return queue.items;
    });
  }

  private path(memberId: string) {
    return resolveInsideDataRoot(".state", "report-queues", `${memberId}.json`);
  }

  private async read(memberId: string) {
    try {
      const raw = await readFile(this.path(memberId), "utf8");
      return reportQueueSchema.parse(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return reportQueueSchema.parse({ version: 1, items: [] });
      }
      throw error;
    }
  }
}
