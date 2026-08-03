import "server-only";

import { compare, hash } from "bcryptjs";
import { readdir } from "node:fs/promises";
import { resolveInsideDataRoot } from "@/lib/data-root";
import { resourceIdSchema } from "@/lib/schemas/common";
import { memberConfigSchema } from "@/lib/schemas/member";
import { updateAccountSchema, userSchema, type User } from "@/lib/schemas/user";
import { atomicWriteJson, readJson } from "./json-file";
import { withResourceLock } from "./resource-lock";

export class DuplicateUsernameError extends Error {}
export class InvalidCurrentPasswordError extends Error {}
export class UserVersionConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super(`Expected version does not match current version ${currentVersion}`);
  }
}

export class UserRepository {
  private async listAccounts(): Promise<User[]> {
    const usersRoot = resolveInsideDataRoot("users");
    const entries = await readdir(usersRoot, { withFileTypes: true });
    const accounts: User[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !resourceIdSchema.safeParse(entry.name).success) continue;
      try {
        accounts.push(await readJson(resolveInsideDataRoot("users", entry.name, "account.json"), userSchema));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return accounts;
  }

  async findEnabledByUsername(username: string): Promise<User | null> {
    const usersRoot = resolveInsideDataRoot("users");
    let entries;
    try {
      entries = await readdir(usersRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !resourceIdSchema.safeParse(entry.name).success) continue;
      try {
        const user = await readJson(resolveInsideDataRoot("users", entry.name, "account.json"), userSchema);
        if (user.enabled && user.username === username) return user;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return null;
  }

  async getById(userId: string): Promise<User | null> {
    const id = resourceIdSchema.parse(userId);
    try {
      const account = await readJson(resolveInsideDataRoot("users", id, "account.json"), userSchema);
      if (account.id !== id) throw new Error("Account directory and ID do not match");
      return account;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async setEnabled(userId: string, expectedVersion: number, enabled: boolean) {
    const id = resourceIdSchema.parse(userId);
    return withResourceLock("account", "username-registry", () =>
      withResourceLock("member", id, async () => {
        const accountPath = resolveInsideDataRoot("users", id, "account.json");
        const configPath = resolveInsideDataRoot("users", id, "config.json");
        const [account, config] = await Promise.all([
          readJson(accountPath, userSchema),
          readJson(configPath, memberConfigSchema),
        ]);
        if (account.id !== id || config.id !== id || account.memberId !== id) {
          throw new Error("Account and member IDs do not match");
        }
        const currentVersion = config.version ?? 1;
        if (currentVersion !== expectedVersion) throw new UserVersionConflictError(currentVersion);
        const updatedAccount = userSchema.parse({ ...account, enabled });
        const updatedConfig = memberConfigSchema.parse({ ...config, enabled, version: currentVersion + 1 });

        await atomicWriteJson(accountPath, updatedAccount);
        try {
          await atomicWriteJson(configPath, updatedConfig);
        } catch (error) {
          await atomicWriteJson(accountPath, account);
          throw error;
        }
        return { enabled, version: updatedConfig.version ?? currentVersion + 1 };
      })
    );
  }

  async updateOwnAccount(userId: string, input: unknown): Promise<{ id: string; username: string }> {
    const id = resourceIdSchema.parse(userId);
    const data = updateAccountSchema.parse(input);
    return withResourceLock("account", "username-registry", async () => {
      const accountPath = resolveInsideDataRoot("users", id, "account.json");
      const account = await readJson(accountPath, userSchema);
      if (account.id !== id) throw new Error("Account directory and ID do not match");
      if (!(await compare(data.currentPassword, account.passwordHash))) throw new InvalidCurrentPasswordError();
      const duplicate = (await this.listAccounts()).find((candidate) => candidate.id !== id && candidate.username === data.username);
      if (duplicate) throw new DuplicateUsernameError();
      const updated = userSchema.parse({
        ...account,
        username: data.username,
        passwordHash: data.newPassword ? await hash(data.newPassword, 12) : account.passwordHash,
      });
      await atomicWriteJson(accountPath, updated);
      return { id: updated.id, username: updated.username };
    });
  }
}
