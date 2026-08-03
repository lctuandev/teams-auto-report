import "server-only";

import { access, readdir } from "node:fs/promises";
import { resolveInsideDataRoot } from "@/lib/data-root";
import { resourceIdSchema } from "@/lib/schemas/common";
import {
  memberConfigSchema,
  memberStateSchema,
  reportConfigDataSchema,
  taskInputSchema,
  toSafeMember,
  type SafeMember,
} from "@/lib/schemas/member";
import { atomicWriteJson, readJson } from "./json-file";
import { withResourceLock } from "./resource-lock";

export class VersionConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super(`Expected version does not match current version ${currentVersion}`);
  }
}

export class MemberRepository {
  async listSafe(): Promise<SafeMember[]> {
    const membersRoot = resolveInsideDataRoot("users");
    const entries = await readdir(membersRoot, { withFileTypes: true });
    const memberIds = await Promise.all(entries
      .filter((entry) => entry.isDirectory() && resourceIdSchema.safeParse(entry.name).success)
      .map(async (entry) => {
        try {
          await access(resolveInsideDataRoot("users", entry.name, "config.json"));
          return entry.name;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        }
      }));
    const members = await Promise.all(memberIds.filter((id): id is string => id !== null).map((id) => this.getSafe(id)));

    return members.sort((a, b) => a.displayName.localeCompare(b.displayName, "vi"));
  }

  async getSafe(memberId: string): Promise<SafeMember> {
    const id = resourceIdSchema.parse(memberId);
    const directory = resolveInsideDataRoot("users", id);
    const [config, state] = await Promise.all([
      readJson(resolveInsideDataRoot("users", id, "config.json"), memberConfigSchema),
      readJson(resolveInsideDataRoot("users", id, "state.json"), memberStateSchema),
    ]);

    if (config.id !== id) {
      throw new Error(`Member directory and config ID do not match: ${directory}`);
    }

    return toSafeMember(config, state);
  }

  async getEditableTasks(memberId: string) {
    const id = resourceIdSchema.parse(memberId);
    const config = await readJson(resolveInsideDataRoot("users", id, "config.json"), memberConfigSchema);
    if (config.id !== id) throw new Error("Member directory and config ID do not match");
    return {
      memberId: id,
      version: config.version ?? 1,
      excludeCompletedTasks: config.report.excludeCompletedTasks === true,
      tasks: config.tasks.map((task) => ({
        id: task.id ?? `task_${crypto.randomUUID()}`,
        title: task.title,
        startPercent: task.startPercent,
        dailyIncrease: task.dailyIncrease ?? null,
        dailyIncreaseRange: task.dailyIncreaseRange ?? null,
        maxPercent: task.maxPercent,
      })),
    };
  }

  async getHistory(memberId: string, page = 1, pageSize = 20) {
    const id = resourceIdSchema.parse(memberId);
    const safePage = Math.max(1, Math.floor(page));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const state = await readJson(resolveInsideDataRoot("users", id, "state.json"), memberStateSchema);
    const items = Object.entries(state.postedReports)
      .map(([date, raw]) => {
        const report = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        return {
          date,
          checked: report.checked === true,
          postedAt: typeof report.postedAt === "string" ? report.postedAt : null,
          reportNumber: typeof report.reportNumber === "string" ? report.reportNumber : null,
          title: typeof report.title === "string" ? report.title : null,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
    const start = (safePage - 1) * safePageSize;
    return {
      items: items.slice(start, start + safePageSize),
      pagination: { page: safePage, pageSize: safePageSize, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / safePageSize)) },
    };
  }

  async getEditableReportConfig(memberId: string) {
    const id = resourceIdSchema.parse(memberId);
    const [config, state] = await Promise.all([
      readJson(resolveInsideDataRoot("users", id, "config.json"), memberConfigSchema),
      readJson(resolveInsideDataRoot("users", id, "state.json"), memberStateSchema),
    ]);
    const initialReportedWorkdaysByMonth =
      config.report.initialReportedWorkdaysByMonth &&
      typeof config.report.initialReportedWorkdaysByMonth === "object" &&
      !Array.isArray(config.report.initialReportedWorkdaysByMonth)
        ? Object.fromEntries(
            Object.entries(config.report.initialReportedWorkdaysByMonth)
              .filter(([month, value]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && Number.isInteger(value) && Number(value) >= 0)
              .map(([month, value]) => [month, Number(value)]),
          )
        : {};
    const monthlySummaries = Object.fromEntries(
      Object.entries(state.monthlyReports).flatMap(([month, raw]) => {
        const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const base = Number(value.baseReportedWorkdays);
        const reported = Number(value.reportedWorkdays);
        const total = Number(value.totalWorkdays);
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
        return [[month, {
          baseReportedWorkdays: Number.isFinite(base) ? base : null,
          reportedWorkdays: Number.isFinite(reported) ? reported : null,
          totalWorkdays: Number.isFinite(total) ? total : null,
        }]];
      }),
    );
    return {
      memberId: id,
      version: config.version ?? 1,
      schedule: {
        postAfterTime: config.schedule.postAfterTime,
        postAfterRandomWindowMinutes: config.schedule.postAfterRandomWindowMinutes,
        skipIfBeforePostTime: config.schedule.skipIfBeforePostTime,
      },
      pending: config.pending.map((entry) => {
        const value = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        return { item: typeof value.item === "string" ? value.item : "", solution: typeof value.solution === "string" ? value.solution : "" };
      }),
      innovations: config.innovations.map((entry) => {
        const value = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
        return { item: typeof value.item === "string" ? value.item : "", support: typeof value.support === "string" ? value.support : "" };
      }),
      report: {
        numberTemplate: typeof config.report.numberTemplate === "string" ? config.report.numberTemplate : typeof config.report.reportNumberTemplate === "string" ? config.report.reportNumberTemplate : "T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}",
        countProgressByWorkdaysOnly: config.report.countProgressByWorkdaysOnly !== false,
        initialReportedWorkdaysByMonth,
        skipDates: Array.isArray(config.report.skipDates) ? config.report.skipDates.filter((date): date is string => typeof date === "string") : [],
        extraWorkDates: Array.isArray(config.report.extraWorkDates) ? config.report.extraWorkDates.filter((date): date is string => typeof date === "string") : [],
      },
      monthlySummaries,
    };
  }

  async updateReportConfig(memberId: string, expectedVersion: number, input: unknown) {
    const id = resourceIdSchema.parse(memberId);
    const data = reportConfigDataSchema.parse(input);
    return withResourceLock("member", id, async () => {
      const configPath = resolveInsideDataRoot("users", id, "config.json");
      const config = await readJson(configPath, memberConfigSchema);
      const currentVersion = config.version ?? 1;
      if (currentVersion !== expectedVersion) throw new VersionConflictError(currentVersion);
      const updated = memberConfigSchema.parse({
        ...config,
        version: currentVersion + 1,
        schedule: { ...config.schedule, ...data.schedule },
        pending: data.pending,
        innovations: data.innovations,
        report: {
          ...config.report,
          numberTemplate: data.report.numberTemplate,
          countProgressByWorkdaysOnly: data.report.countProgressByWorkdaysOnly,
          initialReportedWorkdaysByMonth: data.report.initialReportedWorkdaysByMonth,
          skipDates: [...new Set(data.report.skipDates)].sort(),
          extraWorkDates: [...new Set(data.report.extraWorkDates)].sort(),
        },
      });
      await atomicWriteJson(configPath, updated);
      return { version: updated.version ?? currentVersion + 1 };
    });
  }

  async updateTasks(memberId: string, expectedVersion: number, inputTasks: unknown[], excludeCompletedTasks?: boolean): Promise<SafeMember> {
    const id = resourceIdSchema.parse(memberId);
    const tasks = inputTasks.map((task) => taskInputSchema.parse(task));

    return withResourceLock("member", id, async () => {
      const configPath = resolveInsideDataRoot("users", id, "config.json");
      const statePath = resolveInsideDataRoot("users", id, "state.json");
      const config = await readJson(configPath, memberConfigSchema);
      const currentVersion = config.version ?? 1;
      if (currentVersion !== expectedVersion) throw new VersionConflictError(currentVersion);

      const updated = memberConfigSchema.parse({
        ...config,
        version: currentVersion + 1,
        tasks: tasks.map((task) => ({ ...task, id: task.id ?? `task_${crypto.randomUUID()}` })),
        report: {
          ...config.report,
          ...(excludeCompletedTasks === undefined ? {} : { excludeCompletedTasks }),
        },
      });
      await atomicWriteJson(configPath, updated);
      const state = await readJson(statePath, memberStateSchema);
      return toSafeMember(updated, state);
    });
  }

  async updateGroup(memberId: string, expectedVersion: number, groupId: string) {
    const id = resourceIdSchema.parse(memberId);
    const targetGroupId = resourceIdSchema.parse(groupId);
    return withResourceLock("member", id, async () => {
      const configPath = resolveInsideDataRoot("users", id, "config.json");
      const config = await readJson(configPath, memberConfigSchema);
      const currentVersion = config.version ?? 1;
      if (currentVersion !== expectedVersion) throw new VersionConflictError(currentVersion);
      const updated = memberConfigSchema.parse({ ...config, groupId: targetGroupId, version: currentVersion + 1 });
      await atomicWriteJson(configPath, updated);
      const state = await readJson(resolveInsideDataRoot("users", id, "state.json"), memberStateSchema);
      return toSafeMember(updated, state);
    });
  }

  async getDailyStatus(memberId: string, date: string) {
    const id = resourceIdSchema.parse(memberId);
    const [config, state] = await Promise.all([
      readJson(resolveInsideDataRoot("users", id, "config.json"), memberConfigSchema),
      readJson(resolveInsideDataRoot("users", id, "state.json"), memberStateSchema),
    ]);
    const skipDates = Array.isArray(config.report.skipDates) ? config.report.skipDates.filter((value): value is string => typeof value === "string") : [];
    const extraWorkDates = Array.isArray(config.report.extraWorkDates) ? config.report.extraWorkDates.filter((value): value is string => typeof value === "string") : [];
    const dailyPlan = state.dailyPlans[date];
    const persistedStatus = dailyPlan && typeof dailyPlan === "object"
      ? (dailyPlan as Record<string, unknown>).checkInStatus
      : null;
    const status = skipDates.includes(date)
      ? "skip" as const
      : extraWorkDates.includes(date) || persistedStatus === "report"
        ? "report" as const
        : "pending" as const;
    return { date, status, version: config.version ?? 1 };
  }

  async confirmDailyReport(memberId: string, expectedVersion: number, date: string) {
    const id = resourceIdSchema.parse(memberId);
    return withResourceLock("member", id, async () => {
      const configPath = resolveInsideDataRoot("users", id, "config.json");
      const statePath = resolveInsideDataRoot("users", id, "state.json");
      const [config, state] = await Promise.all([
        readJson(configPath, memberConfigSchema),
        readJson(statePath, memberStateSchema),
      ]);
      const currentVersion = config.version ?? 1;
      if (currentVersion !== expectedVersion) throw new VersionConflictError(currentVersion);
      const skipDates = Array.isArray(config.report.skipDates) ? config.report.skipDates.filter((value): value is string => typeof value === "string") : [];
      if (skipDates.includes(date)) throw new Error("Daily report is already skipped");
      const currentPlan = state.dailyPlans[date];
      const dailyPlan = currentPlan && typeof currentPlan === "object" ? currentPlan as Record<string, unknown> : {};
      const updatedState = memberStateSchema.parse({
        ...state,
        dailyPlans: {
          ...state.dailyPlans,
          [date]: { ...dailyPlan, checkInStatus: "report", checkInUpdatedAt: new Date().toISOString() },
        },
      });
      const updatedConfig = memberConfigSchema.parse({ ...config, version: currentVersion + 1 });
      await atomicWriteJson(statePath, updatedState);
      try {
        await atomicWriteJson(configPath, updatedConfig);
      } catch (error) {
        await atomicWriteJson(statePath, state);
        throw error;
      }
      return { date, status: "report" as const, version: updatedConfig.version ?? currentVersion + 1 };
    });
  }

  async approveSpecialDailyReport(memberId: string, expectedVersion: number, date: string) {
    const id = resourceIdSchema.parse(memberId);
    return withResourceLock("member", id, async () => {
      const configPath = resolveInsideDataRoot("users", id, "config.json");
      const statePath = resolveInsideDataRoot("users", id, "state.json");
      const [config, state] = await Promise.all([
        readJson(configPath, memberConfigSchema),
        readJson(statePath, memberStateSchema),
      ]);
      const currentVersion = config.version ?? 1;
      if (currentVersion !== expectedVersion) throw new VersionConflictError(currentVersion);
      const skipDates = Array.isArray(config.report.skipDates) ? config.report.skipDates.filter((value): value is string => typeof value === "string") : [];
      if (skipDates.includes(date)) throw new Error("Daily report is already skipped");
      const currentExtraWorkDates = Array.isArray(config.report.extraWorkDates) ? config.report.extraWorkDates.filter((value): value is string => typeof value === "string") : [];
      const extraWorkDates = [...new Set([...currentExtraWorkDates, date])].sort();
      const updated = memberConfigSchema.parse({ ...config, version: currentVersion + 1, report: { ...config.report, extraWorkDates } });
      const currentPlan = state.dailyPlans[date];
      const dailyPlan = currentPlan && typeof currentPlan === "object" ? currentPlan as Record<string, unknown> : {};
      const updatedState = memberStateSchema.parse({
        ...state,
        dailyPlans: {
          ...state.dailyPlans,
          [date]: { ...dailyPlan, checkInStatus: "report", checkInUpdatedAt: new Date().toISOString() },
        },
      });
      await atomicWriteJson(statePath, updatedState);
      try {
        await atomicWriteJson(configPath, updated);
      } catch (error) {
        await atomicWriteJson(statePath, state);
        throw error;
      }
      return { date, status: "report" as const, version: updated.version ?? currentVersion + 1 };
    });
  }

  async skipDailyReport(memberId: string, expectedVersion: number, date: string) {
    const id = resourceIdSchema.parse(memberId);
    return withResourceLock("member", id, async () => {
      const configPath = resolveInsideDataRoot("users", id, "config.json");
      const config = await readJson(configPath, memberConfigSchema);
      const currentVersion = config.version ?? 1;
      if (currentVersion !== expectedVersion) throw new VersionConflictError(currentVersion);
      const currentSkipDates = Array.isArray(config.report.skipDates) ? config.report.skipDates.filter((value): value is string => typeof value === "string") : [];
      const skipDates = [...new Set([...currentSkipDates, date])].sort();
      const updated = memberConfigSchema.parse({ ...config, version: currentVersion + 1, report: { ...config.report, skipDates } });
      await atomicWriteJson(configPath, updated);
      return { date, status: "skip" as const, version: updated.version ?? currentVersion + 1 };
    });
  }
}
