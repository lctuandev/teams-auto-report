import { describe, expect, it } from "vitest";
import { hasSameOrigin } from "./same-origin";

describe("same-origin protection", () => {
  it("accepts matching origin and host", () => {
    expect(hasSameOrigin(new Request("http://localhost/api", {
      headers: { origin: "http://localhost:3000", host: "localhost:3000" },
    }))).toBe(true);
  });

  it("rejects missing and cross-site origins", () => {
    expect(hasSameOrigin(new Request("http://localhost/api", { headers: { host: "localhost:3000" } }))).toBe(false);
    expect(hasSameOrigin(new Request("http://localhost/api", {
      headers: { origin: "https://attacker.example", host: "localhost:3000" },
    }))).toBe(false);
  });
});
