import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ authenticated: false }, { status: 401 });

  return Response.json({
    authenticated: true,
    user: {
      id: session.userId,
      username: session.username,
      memberId: session.memberId,
      role: session.role,
    },
  });
}
