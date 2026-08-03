import { describe, expect, it } from "vitest";
import { consumeMutationLimit, mutationKey } from "./mutation-rate-limit";
describe("mutation rate limit", () => {
  it("limits a user/address pair within one minute", () => {
    const key = `test_${crypto.randomUUID()}`;
    for (let index = 0; index < 30; index += 1) expect(consumeMutationLimit(key, 1_000).allowed).toBe(true);
    expect(consumeMutationLimit(key, 1_000).allowed).toBe(false);
    expect(consumeMutationLimit(key, 61_000).allowed).toBe(true);
  });
  it("builds a stable user and forwarded-address key", () => {
    expect(mutationKey(new Request("http://localhost", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }), "user")).toBe("user:1.2.3.4");
  });
});
