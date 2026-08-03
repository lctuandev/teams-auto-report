import { describe, expect, it } from "vitest";
import { canEditGroup, canEditMember, canManageUsers } from "./policy";

const member = { userId: "user_one", username: "user_one", memberId: "member_one", role: "member" as const };
const admin = { userId: "admin_one", username: "admin_one", memberId: null, role: "admin" as const };

describe("authorization policy", () => {
  it("only lets a member edit their linked member", () => {
    expect(canEditMember(member, "member_one")).toBe(true);
    expect(canEditMember(member, "member_two")).toBe(false);
    expect(canEditMember(admin, "member_one")).toBe(false);
  });

  it("lets group owners and admins edit groups", () => {
    expect(canEditGroup(member, { createdBy: "user_one" })).toBe(true);
    expect(canEditGroup(member, { createdBy: "user_two" })).toBe(false);
    expect(canEditGroup(admin, { createdBy: "user_two" })).toBe(true);
    expect(canManageUsers(member)).toBe(false);
    expect(canManageUsers(admin)).toBe(true);
  });
});
