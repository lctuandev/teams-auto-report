import { access, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { withResourceLock } from "./resource-lock";

const originalRoot = process.env.JSON_DATA_ROOT;
afterEach(() => {
  if (originalRoot === undefined) delete process.env.JSON_DATA_ROOT;
  else process.env.JSON_DATA_ROOT = originalRoot;
});

it("uses the shared bot-compatible lock name for members", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "shared-member-lock-"));
  process.env.JSON_DATA_ROOT = root;
  const lockPath = path.join(root, ".locks", "member-member_one.lock");

  await withResourceLock("member", "member_one", async () => {
    await expect(access(lockPath)).resolves.toBeUndefined();
  });

  await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
});
