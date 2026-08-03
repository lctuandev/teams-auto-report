import { expect, it } from "vitest";
import { createClientUuid } from "./client-id";

it("creates an ID that is compatible with task resource IDs", () => {
  expect(createClientUuid()).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  );
});
