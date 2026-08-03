import "server-only";

import path from "node:path";

export function getDataRoot(): string {
  return path.resolve(process.env.JSON_DATA_ROOT ?? path.join(process.cwd(), ".."));
}

export function resolveInsideDataRoot(...segments: string[]): string {
  const root = getDataRoot();
  const resolved = path.resolve(root, ...segments);
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Resolved path is outside JSON_DATA_ROOT");
  }

  return resolved;
}
