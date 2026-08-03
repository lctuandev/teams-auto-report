import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemberRepository, VersionConflictError } from "./member-repository";

const originalRoot = process.env.JSON_DATA_ROOT;
afterEach(() => { if (originalRoot === undefined) delete process.env.JSON_DATA_ROOT; else process.env.JSON_DATA_ROOT = originalRoot; });

describe("member optimistic concurrency", () => {
  it("allows one writer and rejects the stale writer", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "member-concurrency-"));
    const directory = path.join(root, "users", "member_one");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "config.json"), JSON.stringify({
      id: "member_one", enabled: true, version: 1,
      tasks: [{ id: "task_one", title: "Initial", startPercent: 0, maxPercent: 100 }],
      pending: [], innovations: [], schedule: { postAfterTime: "17:30", postAfterRandomWindowMinutes: 0, skipIfBeforePostTime: true }, report: {},
    }));
    await writeFile(path.join(directory, "state.json"), JSON.stringify({ postedReports: {}, dailyPlans: {}, monthlyReports: {}, parentPosts: {} }));
    process.env.JSON_DATA_ROOT = root;
    const repository = new MemberRepository();
    const results = await Promise.allSettled([
      repository.updateTasks("member_one", 1, [{ id: "task_one", title: "Writer A", startPercent: 10, maxPercent: 100 }]),
      repository.updateTasks("member_one", 1, [{ id: "task_one", title: "Writer B", startPercent: 20, maxPercent: 100 }]),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(VersionConflictError);
  });
});
