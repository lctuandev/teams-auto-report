import { describe, expect, it } from "vitest";
import { shouldUseSecureCookie } from "./cookie-security";

describe("shouldUseSecureCookie", () => {
  it("allows a session cookie over direct HTTP even in production", () => {
    expect(
      shouldUseSecureCookie({
        origin: "http://10.5.9.87:3100",
        nodeEnv: "production",
      }),
    ).toBe(false);
  });

  it("uses a secure cookie behind an HTTPS reverse proxy", () => {
    expect(
      shouldUseSecureCookie({
        forwardedProto: "https",
        origin: "http://report-web:3000",
        nodeEnv: "production",
      }),
    ).toBe(true);
  });

  it("uses the first forwarded protocol supplied by a proxy chain", () => {
    expect(
      shouldUseSecureCookie({
        forwardedProto: "https, http",
        nodeEnv: "production",
      }),
    ).toBe(true);
  });

  it("supports an explicit operational override", () => {
    expect(
      shouldUseSecureCookie({
        override: "false",
        forwardedProto: "https",
        nodeEnv: "production",
      }),
    ).toBe(false);
    expect(
      shouldUseSecureCookie({
        override: "true",
        origin: "http://10.5.9.87:3100",
        nodeEnv: "development",
      }),
    ).toBe(true);
  });

  it("keeps the safe production default when request metadata is absent", () => {
    expect(shouldUseSecureCookie({ nodeEnv: "production" })).toBe(true);
  });
});
