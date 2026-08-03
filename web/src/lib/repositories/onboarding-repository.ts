import "server-only";

import { hash } from "bcryptjs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { resolveInsideDataRoot } from "@/lib/data-root";
import { displayNameToMemberId } from "@/lib/member-id";
import { createOnboardingAccountSchema } from "@/lib/schemas/onboarding";
import { userSchema } from "@/lib/schemas/user";
import { memberConfigSchema, memberStateSchema } from "@/lib/schemas/member";
import { atomicWriteJson, readJson } from "./json-file";
import { withResourceLock } from "./resource-lock";

export class OnboardingConflictError extends Error {}

export class OnboardingRepository {
  async create(input: unknown) {
    const data = createOnboardingAccountSchema.parse(input);
    const memberId = displayNameToMemberId(data.displayName);
    return withResourceLock("account", "onboarding-registry", async () => {
      const directory = resolveInsideDataRoot("users", memberId);
      try {
        await mkdir(directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new OnboardingConflictError("Member ID already exists");
        throw error;
      }

      try {
        for (const entry of await readdir(resolveInsideDataRoot("users"), { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          try {
            const account = await readJson(resolveInsideDataRoot("users", entry.name, "account.json"), userSchema);
            if (account.username === data.username) throw new OnboardingConflictError("Username already exists");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }

        const config = memberConfigSchema.parse({
          id: memberId, enabled: true, groupId: data.groupId, version: 1, tasks: [], pending: [], innovations: [],
          schedule: { postAfterTime: data.postAfterTime, postAfterRandomWindowMinutes: data.postAfterRandomWindowMinutes, skipIfBeforePostTime: true },
          report: { numberTemplate: "T{MM}/{REPORT_INDEX}/{MONTH_WORKDAYS}", countProgressByWorkdaysOnly: true, excludeCompletedTasks: false, skipDates: [], extraWorkDates: [] },
          author: { displayName: data.displayName },
        });
        const state = memberStateSchema.parse({ postedReports: {}, dailyPlans: {}, monthlyReports: {}, parentPosts: {}, browserRenewals: {} });
        const account = userSchema.parse({ id: memberId, username: data.username, passwordHash: await hash(data.password, 12), memberId, role: "member", enabled: true });
        const credentials = {
          auth: {
            common: { clientId: "5e3ce6c0-2b1f-4285-8d4b-75ee78787346", redirectUri: "https://teams.cloud.microsoft/v2/authv2", brkClientId: "5e3ce6c0-2b1f-4285-8d4b-75ee78787346", brkRedirectUri: "https://teams.cloud.microsoft/v2/authv2", includeBrkFields: false },
            spaces: { scope: "https://api.spaces.skype.com/.default openid profile offline_access", reusePrimaryRefreshToken: true },
            substrate: { scope: "https://substrate.office.com/.default openid profile offline_access", reusePrimaryRefreshToken: true },
            ic3: { scope: "https://ic3.teams.office.com/.default openid profile offline_access", reusePrimaryRefreshToken: true, claims: { access_token: { xms_cc: { values: ["CP1"] } } } },
          },
          browser: { autoRenew: true, profileDir: `.browser-profiles/${memberId}`, channel: "chrome", headless: false, timeoutMs: 600000 },
          author: { displayName: data.displayName },
        };
        await Promise.all([
          atomicWriteJson(resolveInsideDataRoot("users", memberId, "config.json"), config),
          atomicWriteJson(resolveInsideDataRoot("users", memberId, "state.json"), state),
          atomicWriteJson(resolveInsideDataRoot("users", memberId, "credentials.json"), credentials),
          atomicWriteJson(resolveInsideDataRoot("users", memberId, "account.json"), account),
        ]);
        return { memberId, username: data.username };
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
    });
  }
}
