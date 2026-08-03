import { hash, compare } from "bcryptjs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { DuplicateUsernameError, InvalidCurrentPasswordError, UserRepository } from "./user-repository";

const originalRoot = process.env.JSON_DATA_ROOT;
afterEach(() => {
  if (originalRoot === undefined) delete process.env.JSON_DATA_ROOT;
  else process.env.JSON_DATA_ROOT = originalRoot;
});

async function createAccount(root: string, id: string, username: string, password: string) {
  const directory = path.join(root, "users", id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "account.json"), JSON.stringify({
    id, username, passwordHash: await hash(password, 4), memberId: id, role: "member", enabled: true,
  }));
}

it("requires the current password and rejects duplicate usernames", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "account-update-"));
  process.env.JSON_DATA_ROOT = root;
  await createAccount(root, "member_one", "member_one", "secret1");
  await createAccount(root, "member_two", "member_two", "secret2");
  const repository = new UserRepository();

  await expect(repository.updateOwnAccount("member_one", {
    currentPassword: "wrong", username: "new_name",
  })).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
  await expect(repository.updateOwnAccount("member_one", {
    currentPassword: "secret1", username: "member_two",
  })).rejects.toBeInstanceOf(DuplicateUsernameError);
});

it("updates username and password while preserving the stable account ID", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "account-update-"));
  process.env.JSON_DATA_ROOT = root;
  await createAccount(root, "member_one", "member_one", "secret1");
  const repository = new UserRepository();
  const result = await repository.updateOwnAccount("member_one", {
    currentPassword: "secret1", username: "new_login", newPassword: "secret2", confirmPassword: "secret2",
  });
  const saved = JSON.parse(await readFile(path.join(root, "users", "member_one", "account.json"), "utf8"));

  expect(result).toEqual({ id: "member_one", username: "new_login" });
  expect(saved.id).toBe("member_one");
  expect(await compare("secret2", saved.passwordHash)).toBe(true);
});

it("updates account and bot enabled flags together", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "account-status-"));
  process.env.JSON_DATA_ROOT = root;
  await createAccount(root, "member_one", "member_one", "secret1");
  await writeFile(path.join(root, "users", "member_one", "config.json"), JSON.stringify({
    id: "member_one",
    enabled: true,
    version: 2,
    tasks: [],
    pending: [],
    innovations: [],
    schedule: { postAfterTime: "17:30", postAfterRandomWindowMinutes: 0, skipIfBeforePostTime: true },
    report: { numberTemplate: "T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}", skipDates: [], extraWorkDates: [] },
  }));

  const result = await new UserRepository().setEnabled("member_one", 2, false);
  const account = JSON.parse(await readFile(path.join(root, "users", "member_one", "account.json"), "utf8"));
  const config = JSON.parse(await readFile(path.join(root, "users", "member_one", "config.json"), "utf8"));

  expect(result).toEqual({ enabled: false, version: 3 });
  expect(account.enabled).toBe(false);
  expect(config.enabled).toBe(false);
  expect(config.version).toBe(3);
});
