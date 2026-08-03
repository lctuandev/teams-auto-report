import { getSession } from "@/lib/auth/session";
import { MemberRepository } from "@/lib/repositories/member-repository";

export async function GET() {
  if (!(await getSession())) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const members = await new MemberRepository().listSafe();
    return Response.json({ members });
  } catch {
    return Response.json({ error: "Unable to read member data" }, { status: 500 });
  }
}
