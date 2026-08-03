import { afterEach, expect, it, vi } from "vitest";
import { isLocalAdminRuntime } from "./local-request";

afterEach(() => vi.unstubAllEnvs());

it("allows local hosts outside production and rejects remote hosts", () => {
  vi.stubEnv("NODE_ENV", "test");
  expect(isLocalAdminRuntime(new Request("http://localhost", { headers: { host: "localhost:3000" } }))).toBe(true);
  expect(isLocalAdminRuntime(new Request("http://localhost", { headers: { host: "127.0.0.1:3000" } }))).toBe(true);
  expect(isLocalAdminRuntime(new Request("http://localhost", { headers: { host: "example.com" } }))).toBe(false);
});
