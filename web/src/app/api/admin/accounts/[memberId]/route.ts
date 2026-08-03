import { getSession } from "@/lib/auth/session";
import { isLocalAdminRuntime } from "@/lib/auth/local-request";
import { consumeMutationLimit, mutationKey } from "@/lib/auth/mutation-rate-limit";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { AccountBusyError, AccountCleanupRepository } from "@/lib/repositories/account-cleanup-repository";
import { AuditRepository } from "@/lib/repositories/audit-repository";
import { ResourceLockedError } from "@/lib/repositories/resource-lock";
import { resourceIdSchema } from "@/lib/schemas/common";
import { UserRepository, UserVersionConflictError } from "@/lib/repositories/user-repository";
import { z } from "zod";

const statusSchema = z.object({
  enabled: z.boolean(),
  expectedVersion: z.number().int().positive(),
});

export async function PATCH(request: Request, context: RouteContext<"/api/admin/accounts/[memberId]">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });

  const { memberId: rawMemberId } = await context.params;
  const parsedId = resourceIdSchema.safeParse(rawMemberId);
  if (!parsedId.success) return Response.json({ error: "Invalid member ID" }, { status: 400 });
  const memberId = parsedId.data;
  if (memberId === session.userId || memberId === session.memberId) {
    return Response.json({ error: "Bạn không thể tự tắt account đang đăng nhập." }, { status: 409 });
  }
  const input = statusSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Invalid account status" }, { status: 400 });

  try {
    const result = await new UserRepository().setEnabled(memberId, input.data.expectedVersion, input.data.enabled);
    await new AuditRepository().append({
      actorUserId: session.userId,
      action: input.data.enabled ? "account.enable" : "account.disable",
      targetType: "user",
      targetId: memberId,
      requestId: crypto.randomUUID(),
      fields: ["account.enabled", "config.enabled", "config.version"],
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof UserVersionConflictError) {
      return Response.json({ error: "Version conflict", currentVersion: error.currentVersion }, { status: 409 });
    }
    if (error instanceof ResourceLockedError) {
      return Response.json({ error: "User đang được cập nhật hoặc bot đang chạy." }, { status: 423 });
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Response.json({ error: "Account or member config was not found" }, { status: 404 });
    }
    return Response.json({ error: "Không thể cập nhật trạng thái user." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/accounts/[memberId]">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!isLocalAdminRuntime(request)) return Response.json({ error: "Account cleanup is local-only" }, { status: 403 });
  if (!hasSameOrigin(request)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const limit = consumeMutationLimit(mutationKey(request, session.userId));
  if (!limit.allowed) return Response.json({ error: "Too many requests" }, { status: 429 });

  const { memberId: rawMemberId } = await context.params;
  const parsedId = resourceIdSchema.safeParse(rawMemberId);
  if (!parsedId.success) return Response.json({ error: "Invalid member ID" }, { status: 400 });
  const memberId = parsedId.data;
  if (memberId === session.userId || memberId === session.memberId) {
    return Response.json({ error: "Bạn không thể xóa account đang đăng nhập." }, { status: 409 });
  }

  const confirmation = request.headers.get("x-confirm-member-id");
  if (confirmation !== memberId) return Response.json({ error: "Member ID confirmation does not match" }, { status: 400 });

  try {
    await new AccountCleanupRepository().remove(memberId);
    await new AuditRepository().append({
      actorUserId: session.userId,
      action: "account.onboarding.delete",
      targetType: "user",
      targetId: memberId,
      requestId: crypto.randomUUID(),
      fields: ["account", "member", "credentials", "state", "browserProfile", "locks"],
    });
    return Response.json({ deleted: true, memberId });
  } catch (error) {
    if (error instanceof AccountBusyError || error instanceof ResourceLockedError) {
      return Response.json({ error: "Account đang được bot hoặc browser sử dụng. Hãy đóng tiến trình rồi thử lại." }, { status: 423 });
    }
    return Response.json({ error: "Không thể xóa account." }, { status: 500 });
  }
}
