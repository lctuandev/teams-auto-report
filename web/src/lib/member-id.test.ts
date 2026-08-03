import { expect, it } from "vitest";
import { displayNameToMemberId } from "./member-id";

it("maps Vietnamese display names to stable member IDs", () => {
  expect(displayNameToMemberId("Lê Công Tuấn")).toBe("le_cong_tuan");
  expect(displayNameToMemberId("  Đào  Lê Sỹ Quỳnh  ")).toBe("dao_le_sy_quynh");
  expect(displayNameToMemberId("Nguyễn Văn A-B")).toBe("nguyen_van_a_b");
});
