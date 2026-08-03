import { getSession } from "@/lib/auth/session";
import { MemberRepository } from "@/lib/repositories/member-repository";
import { resourceIdSchema } from "@/lib/schemas/common";

export async function GET(request: Request, context: RouteContext<"/api/members/[memberId]/history">) {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { memberId } = await context.params;
  if (!resourceIdSchema.safeParse(memberId).success) return Response.json({ error: "Invalid member ID" }, { status: 400 });
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Number(url.searchParams.get("pageSize") || 20);
  if (!Number.isInteger(page) || !Number.isInteger(pageSize)) return Response.json({ error: "Invalid pagination" }, { status: 400 });
  try { return Response.json(await new MemberRepository().getHistory(memberId, page, pageSize)); }
  catch { return Response.json({ error: "Unable to read history" }, { status: 500 }); }
}
