import { hash } from "bcryptjs";
import { open, readFile, readdir, rename } from "node:fs/promises";
import path from "node:path";

const username = process.argv.find((arg) => arg.startsWith("--username="))?.slice(11);
if (!/^[a-z0-9_-]{1,80}$/.test(username ?? "")) {
  throw new Error("Usage: npm run user:password -- --username=<username>");
}

async function readHiddenPassword() {
  if (process.env.UI_USER_PASSWORD) return process.env.UI_USER_PASSWORD;
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Interactive terminal required, or provide UI_USER_PASSWORD through the process environment.");
  }
  process.stdout.write("New password (minimum 6 characters): ");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  let password = "";
  return new Promise((resolve, reject) => {
    const onData = (character) => {
      if (character === "\u0003") {
        process.stdin.setRawMode(false);
        reject(new Error("Cancelled"));
      } else if (character === "\r" || character === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(password);
      } else if (character === "\u007f") {
        password = password.slice(0, -1);
      } else if (character >= " ") {
        password += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

const dataRoot = path.resolve(process.env.JSON_DATA_ROOT ?? path.join(process.cwd(), ".."));
const usersRoot = path.join(dataRoot, "users");
let configPath;
let user;
for (const entry of await readdir(usersRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const candidatePath = path.join(usersRoot, entry.name, "account.json");
  try {
    const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
    if (candidate.username === username) {
      configPath = candidatePath;
      user = candidate;
      break;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
if (!user || !configPath) throw new Error(`User not found: ${username}`);

const password = await readHiddenPassword();
if (password.length < 6 || password.length > 200) throw new Error("Password must contain 6 to 200 characters.");
user.passwordHash = await hash(password, 12);
const temporaryPath = `${configPath}.${process.pid}.tmp`;
const handle = await open(temporaryPath, "wx", 0o600);
try {
  await handle.writeFile(`${JSON.stringify(user, null, 2)}\n`, "utf8");
  await handle.sync();
} finally {
  await handle.close();
}
await rename(temporaryPath, configPath);
console.log(`Password updated for '${username}'.`);
