import { hash } from "bcryptjs";
import { mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import path from "node:path";

const idPattern = /^[a-z0-9_-]{1,80}$/;
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.join("=")];
  }),
);

if (args.help !== undefined) {
  console.log("npm run user:create -- --username=<id> --member-id=<id> [--role=member|admin]");
  process.exit(0);
}

const username = args.username;
const memberId = args["member-id"] || null;
const role = args.role || "member";

if (!idPattern.test(username ?? "") || (memberId && !idPattern.test(memberId)) || !["member", "admin"].includes(role)) {
  throw new Error("Invalid username, member-id or role. IDs must match [a-z0-9_-] and be at most 80 characters.");
}
if (role === "member" && !memberId) throw new Error("A member user requires --member-id.");

async function readHiddenPassword() {
  if (process.env.UI_USER_PASSWORD) return process.env.UI_USER_PASSWORD;
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Interactive terminal required, or provide UI_USER_PASSWORD through the process environment.");
  }

  process.stdout.write("Password (minimum 6 characters): ");
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

const password = await readHiddenPassword();
if (password.length < 6 || password.length > 200) throw new Error("Password must contain 6 to 200 characters.");

const dataRoot = path.resolve(process.env.JSON_DATA_ROOT ?? path.join(process.cwd(), ".."));
const usersDirectory = path.join(dataRoot, "users");
const userId = username;
const userDirectory = path.join(usersDirectory, userId);
await mkdir(usersDirectory, { recursive: true });

const entries = await readdir(usersDirectory, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  try {
    const existing = JSON.parse(await readFile(path.join(usersDirectory, entry.name, "account.json"), "utf8"));
    if (existing.username === username) throw new Error(`Username already exists: ${username}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
await mkdir(userDirectory, { recursive: true });
const accountPath = path.join(userDirectory, "account.json");
try {
  await readFile(accountPath, "utf8");
  throw new Error(`Account already exists: ${username}`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const config = {
  id: userId,
  username,
  passwordHash: await hash(password, 12),
  memberId,
  role,
  enabled: true,
};

const temporaryPath = `${accountPath}.${process.pid}.tmp`;
const handle = await open(temporaryPath, "wx", 0o600);
try {
  await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`, "utf8");
  await handle.sync();
} finally {
  await handle.close();
}
await rename(temporaryPath, accountPath);
console.log(`Created ${role} user '${username}'${memberId ? ` for member '${memberId}'` : ""}.`);
