import { getSession } from "@/lib/auth/session";
import { AuditRepository } from "@/lib/repositories/audit-repository";
export async function GET(request: Request) { const session = await getSession(); if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 }); const url = new URL(request.url); return Response.json(await new AuditRepository().list({ actorUserId: session.userId, page: Number(url.searchParams.get("page") || 1), pageSize: Number(url.searchParams.get("pageSize") || 30) })); }
