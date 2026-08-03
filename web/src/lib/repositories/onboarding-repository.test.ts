import { compare } from "bcryptjs";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { OnboardingRepository } from "./onboarding-repository";

const originalRoot = process.env.JSON_DATA_ROOT;
afterEach(() => {
  if (originalRoot === undefined) delete process.env.JSON_DATA_ROOT;
  else process.env.JSON_DATA_ROOT = originalRoot;
});

it("creates a member, account, isolated credentials and empty state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "onboarding-"));
  await mkdir(path.join(root, "users"), { recursive: true });
  process.env.JSON_DATA_ROOT = root;
  await new OnboardingRepository().create({
    username: "new_login", password: "123456",
    displayName: "New Member", groupId: "group_one", postAfterTime: "17:30",
    postAfterRandomWindowMinutes: 15,
  });
  const directory = path.join(root, "users", "new_member");
  const config = JSON.parse(await readFile(path.join(directory, "config.json"), "utf8"));
  const account = JSON.parse(await readFile(path.join(directory, "account.json"), "utf8"));
  const credentials = JSON.parse(await readFile(path.join(directory, "credentials.json"), "utf8"));
  const state = JSON.parse(await readFile(path.join(directory, "state.json"), "utf8"));

  expect(config).not.toHaveProperty("auth");
  expect(config).not.toHaveProperty("browser");
  expect(config.report.excludeCompletedTasks).toBe(false);
  expect(config.groupId).toBe("group_one");
  expect(account.username).toBe("new_login");
  expect(await compare("123456", account.passwordHash)).toBe(true);
  expect(credentials.browser).toMatchObject({ headless: false, profileDir: ".browser-profiles/new_member" });
  expect(credentials.auth).toHaveProperty("ic3");
  expect(state.postedReports).toEqual({});
});
