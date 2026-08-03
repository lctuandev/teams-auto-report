import "server-only";

import { readdir } from "node:fs/promises";
import { resolveInsideDataRoot } from "@/lib/data-root";
import { resourceIdSchema } from "@/lib/schemas/common";
import { createGroupSchema, groupSchema, updateGroupSchema, type Group } from "@/lib/schemas/group";
import { atomicWriteJson, readJson } from "./json-file";
import { withResourceLock } from "./resource-lock";
import { VersionConflictError } from "./member-repository";

export class GroupRepository {
  async list(): Promise<Group[]> {
    const root = resolveInsideDataRoot("groups");
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const groups = await Promise.all(entries
      .filter((entry) => entry.isDirectory() && resourceIdSchema.safeParse(entry.name).success)
      .map((entry) => this.get(entry.name)));
    return groups.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }

  async get(groupId: string): Promise<Group> {
    const id = resourceIdSchema.parse(groupId);
    const group = await readJson(resolveInsideDataRoot("groups", id, "config.json"), groupSchema);
    if (group.id !== id) throw new Error("Group directory and config ID do not match");
    return group;
  }

  async create(input: unknown, actorUserId: string) {
    const data = createGroupSchema.parse(input);
    return withResourceLock("group", data.id, async () => {
      const filePath = resolveInsideDataRoot("groups", data.id, "config.json");
      try { await readJson(filePath, groupSchema); throw new Error("GROUP_EXISTS"); }
      catch (error) { if ((error as Error).message === "GROUP_EXISTS") throw error; if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const now = new Date().toISOString();
      const group = groupSchema.parse({ ...data, enabled: true, createdBy: actorUserId, createdAt: now, updatedAt: now, version: 1 });
      await atomicWriteJson(filePath, group);
      return group;
    });
  }

  async update(groupId: string, input: unknown) {
    const id = resourceIdSchema.parse(groupId);
    const data = updateGroupSchema.parse(input);
    return withResourceLock("group", id, async () => {
      const filePath = resolveInsideDataRoot("groups", id, "config.json");
      const current = await readJson(filePath, groupSchema);
      if (current.version !== data.expectedVersion) throw new VersionConflictError(current.version);
      const group = groupSchema.parse({ ...current, ...data, id, version: current.version + 1, updatedAt: new Date().toISOString() });
      await atomicWriteJson(filePath, group);
      return group;
    });
  }

  async disable(groupId: string, expectedVersion: number) {
    const id = resourceIdSchema.parse(groupId);
    return withResourceLock("group", id, async () => {
      const filePath = resolveInsideDataRoot("groups", id, "config.json");
      const current = await readJson(filePath, groupSchema);
      if (current.version !== expectedVersion) throw new VersionConflictError(current.version);
      const disabled = groupSchema.parse({ ...current, enabled: false, version: current.version + 1, updatedAt: new Date().toISOString() });
      await atomicWriteJson(filePath, disabled);
      return disabled;
    });
  }
}
