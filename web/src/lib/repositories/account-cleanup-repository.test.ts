import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { AccountBusyError, AccountCleanupRepository } from "./account-cleanup-repository";

const originalRoot = process.env.JSON_DATA_ROOT;
afterEach(() => {
  if (originalRoot === undefined) delete process.env.JSON_DATA_ROOT;
  else process.env.JSON_DATA_ROOT = originalRoot;
});

it("removes an onboarding account, browser profile and dead-owner locks", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "account-cleanup-"));
  const memberId = "member_one";
  await mkdir(path.join(root, "users", memberId), { recursive: true });
  await mkdir(path.join(root, ".browser-profiles", memberId), { recursive: true });
  await mkdir(path.join(root, ".locks"), { recursive: true });
  await writeFile(path.join(root, "users", memberId, "account.json"), "{}");
  await writeFile(path.join(root, ".browser-profiles", memberId, "Cookies"), "session");
  await writeFile(path.join(root, ".locks", `member-${memberId}.lock`), JSON.stringify({ pid: 2_147_483_647 }));
  await writeFile(path.join(root, ".locks", `browser-renew-${memberId}.lock`), JSON.stringify({ pid: 2_147_483_647 }));
  process.env.JSON_DATA_ROOT = root;

  await new AccountCleanupRepository().remove(memberId);

  await expect(stat(path.join(root, "users", memberId))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(stat(path.join(root, ".browser-profiles", memberId))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(path.join(root, ".locks", `member-${memberId}.lock`))).rejects.toMatchObject({ code: "ENOENT" });
});

it("refuses to remove an account while its lock owner is alive", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "account-cleanup-busy-"));
  const memberId = "member_busy";
  await mkdir(path.join(root, "users", memberId), { recursive: true });
  await mkdir(path.join(root, ".locks"), { recursive: true });
  await writeFile(path.join(root, ".locks", `member-${memberId}.lock`), JSON.stringify({ pid: process.pid }));
  process.env.JSON_DATA_ROOT = root;

  await expect(new AccountCleanupRepository().remove(memberId)).rejects.toBeInstanceOf(AccountBusyError);
  await expect(stat(path.join(root, "users", memberId))).resolves.toBeTruthy();
});
