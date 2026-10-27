import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { CatchUpRepository } from "./catch-up-repository";

const originalRoot = process.env.JSON_DATA_ROOT;
afterEach(() => {
  if (originalRoot === undefined) delete process.env.JSON_DATA_ROOT;
  else process.env.JSON_DATA_ROOT = originalRoot;
});

it("keeps one active catch-up request per group and date", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catch-up-"));
  process.env.JSON_DATA_ROOT = root;
  const repository = new CatchUpRepository();

  const first = await repository.enqueue("group_one", "2026-10-09", "user_one");
  const second = await repository.enqueue("group_one", "2026-10-09", "user_one");
  const otherDate = await repository.enqueue("group_one", "2026-10-08", "user_one");

  expect(first.created).toBe(true);
  expect(second).toEqual({ item: first.item, created: false });
  expect(otherDate.created).toBe(true);
  expect(await repository.list("group_one")).toHaveLength(2);
  expect(await repository.list("group_two")).toEqual([]);
});

it("finds parent posts the bot cached for the group", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "catch-up-"));
  process.env.JSON_DATA_ROOT = root;
  await mkdir(path.join(root, ".state"), { recursive: true });
  const key = createHash("sha256").update("group_one|thread-one|2026-10-09").digest("hex");
  await writeFile(path.join(root, ".state", "parent-posts.json"), JSON.stringify({ [key]: { parentMessageId: "123" } }));

  const dates = await new CatchUpRepository().knownParentPostDates("group_one", "thread-one", ["2026-10-08", "2026-10-09"]);
  expect(dates).toEqual(["2026-10-09"]);
});
