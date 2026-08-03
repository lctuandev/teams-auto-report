import "server-only";

import { mkdir, open, readFile } from "node:fs/promises";
import { resolveInsideDataRoot } from "@/lib/data-root";

type AuditEvent = {
  actorUserId: string;
  action: string;
  targetType: "member" | "group" | "user";
  targetId: string;
  requestId: string;
  fields: string[];
};

export class AuditRepository {
  async append(event: AuditEvent) {
    const directory = resolveInsideDataRoot("audit");
    await mkdir(directory, { recursive: true });
    const handle = await open(resolveInsideDataRoot("audit", "events.jsonl"), "a", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify({
        id: crypto.randomUUID(),
        actorUserId: event.actorUserId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        timestamp: new Date().toISOString(),
        requestId: event.requestId,
        changes: { fields: event.fields },
      })}\n`);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async list(options: { actorUserId?: string; page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize ?? 30)));
    let raw = "";
    try { raw = await readFile(resolveInsideDataRoot("audit", "events.jsonl"), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const events = raw.split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try {
        const value = JSON.parse(line) as Record<string, unknown>;
        if (typeof value.id !== "string" || typeof value.actorUserId !== "string" || typeof value.action !== "string" || typeof value.timestamp !== "string") return [];
        const changes = value.changes && typeof value.changes === "object" ? value.changes as Record<string, unknown> : {};
        return [{ id: value.id, actorUserId: value.actorUserId, action: value.action, targetType: typeof value.targetType === "string" ? value.targetType : "unknown", targetId: typeof value.targetId === "string" ? value.targetId : "unknown", timestamp: value.timestamp, requestId: typeof value.requestId === "string" ? value.requestId : null, fields: Array.isArray(changes.fields) ? changes.fields.filter((field): field is string => typeof field === "string") : [] }];
      } catch { return []; }
    }).filter((event) => !options.actorUserId || event.actorUserId === options.actorUserId).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const start = (page - 1) * pageSize;
    return { items: events.slice(start, start + pageSize), pagination: { page, pageSize, total: events.length, totalPages: Math.max(1, Math.ceil(events.length / pageSize)) } };
  }
}
