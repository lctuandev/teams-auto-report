import type { Session } from "@/lib/auth/session";

export function canEditMember(session: Session, targetMemberId: string) {
  return session.memberId === targetMemberId;
}

export function canEditGroup(session: Session, group: { createdBy: string }) {
  return session.role === "admin" || group.createdBy === session.userId;
}

export function canManageUsers(session: Session) {
  return session.role === "admin";
}
