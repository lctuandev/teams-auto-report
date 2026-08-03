import "server-only";

import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { ZodType } from "zod";

export async function readJson<T>(filePath: string, schema: ZodType<T>): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return schema.parse(JSON.parse(raw));
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx", 0o600);

  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
