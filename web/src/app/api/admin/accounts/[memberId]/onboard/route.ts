import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { isLocalAdminRuntime } from "@/lib/auth/local-request";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { getDataRoot, resolveInsideDataRoot } from "@/lib/data-root";
import { atomicWriteJson, readJson } from "@/lib/repositories/json-file";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { resourceIdSchema } from "@/lib/schemas/common";

const credentialsSchema = z.object({ auth: z.record(z.string(), z.unknown()), browser: z.record(z.string(), z.unknown()), author: z.record(z.string(), z.unknown()).optional() }).passthrough();

export async function POST(request: Request, context: RouteContext<"/api/admin/accounts/[memberId]/onboard">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!isLocalAdminRuntime(request)) return Response.json({ error: "Onboarding is local-only" }, { status: 403 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const { memberId: rawMemberId } = await context.params;
  const parsedId = resourceIdSchema.safeParse(rawMemberId);
  if (!parsedId.success) return Response.json({ error: "Invalid member ID" }, { status: 400 });
  const memberId = parsedId.data;

  try {
    await runOnboarding(memberId);
    const credentialsPath = resolveInsideDataRoot("users", memberId, "credentials.json");
    const credentials = await readJson(credentialsPath, credentialsSchema);
    await atomicWriteJson(credentialsPath, { ...credentials, browser: { ...credentials.browser, headless: true } });
    await new AuditRepository().append({ actorUserId: session.userId, action: "account.onboarding.browser.complete", targetType: "user", targetId: memberId, requestId: crypto.randomUUID(), fields: ["credentials", "browserProfile"] });
    return Response.json({
      completed: true,
      copyPaths: [`users/${memberId}/`, `.browser-profiles/${memberId}/`],
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Browser onboarding failed" }, { status: 500 });
  }
}

function runOnboarding(memberId: string) {
  const root = getDataRoot();
  const script = path.join(root, "auto_report.js");
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script, "--renew-token", `--member=${memberId}`], { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const collect = (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-40_000); };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timeout = setTimeout(() => child.kill("SIGTERM"), 12 * 60 * 1000);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Onboarding process failed (${signal ?? code}). ${output.slice(-2_000)}`));
    });
  });
}
