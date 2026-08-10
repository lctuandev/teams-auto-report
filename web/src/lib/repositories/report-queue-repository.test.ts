import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { ReportAlreadyPostedError, ReportQueueRepository } from "./report-queue-repository";

const isolatedTasks = [{
  id: "backfill_task_one",
  title: "Historical task",
  startPercent: 10,
  dailyIncrease: 5,
  maxPercent: 100,
}];

const originalRoot = process.env.JSON_DATA_ROOT;
afterEach(() => {
  if (originalRoot === undefined) delete process.env.JSON_DATA_ROOT;
  else process.env.JSON_DATA_ROOT = originalRoot;
});

async function createState(root: string, postedReports: Record<string, unknown> = {}) {
  const directory = path.join(root, "users", "member_one");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "state.json"), JSON.stringify({
    postedReports,
    dailyPlans: {},
    monthlyReports: {},
    parentPosts: {},
  }));
}

it("persists queue items and ignores a duplicate active date", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-queue-"));
  process.env.JSON_DATA_ROOT = root;
  await createState(root);
  const repository = new ReportQueueRepository();

  await repository.enqueue("member_one", [{ date: "2026-08-07", title: "Report 07" }], isolatedTasks);
  await repository.enqueue("member_one", [{ date: "2026-08-07", title: "Report 07" }], isolatedTasks);
  const items = await repository.list("member_one");

  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ memberId: "member_one", date: "2026-08-07", status: "queued" });
  expect(items[0].tasks).toEqual(isolatedTasks);
  expect(items[0].batchId).toMatch(/^batch_/);
  const stored = JSON.parse(await readFile(path.join(root, ".state", "report-queues", "member_one.json"), "utf8"));
  expect(stored.items).toHaveLength(1);
});

it("rejects a date already marked as posted", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-queue-posted-"));
  process.env.JSON_DATA_ROOT = root;
  await createState(root, { "2026-08-07": { checked: true } });

  await expect(new ReportQueueRepository().enqueue("member_one", [
    { date: "2026-08-07", title: "Report 07" },
  ], isolatedTasks)).rejects.toBeInstanceOf(ReportAlreadyPostedError);
});
