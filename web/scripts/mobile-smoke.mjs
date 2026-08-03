import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { SignJWT } from "jose";

const env = Object.fromEntries((await readFile(".env.local", "utf8")).split(/\r?\n/).filter((line) => line && !line.startsWith("#")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1)];
}));
const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const viewport = {
  width: Number(process.env.SMOKE_WIDTH ?? 390),
  height: Number(process.env.SMOKE_HEIGHT ?? 844),
};
const token = await new SignJWT({ userId: "le_cong_tuan", username: "le_cong_tuan", memberId: "le_cong_tuan", role: "member" })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m")
  .sign(new TextEncoder().encode(env.AUTH_SECRET));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
await context.addCookies([{ name: "teams_report_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
const routes = process.env.SMOKE_ROUTES?.split(",").filter(Boolean) ?? ["/", "/members", "/members/le_cong_tuan", "/me/tasks", "/me/report-config", "/groups", "/groups/new", "/groups/advance_uav_navigation/edit", "/me/group", "/audit"];
let failed = false;
for (const route of routes) {
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    title: document.title,
    offenders: [...document.querySelectorAll("*")].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
    }).slice(0, 8).map((element) => ({
      tag: element.tagName,
      text: element.textContent?.trim().slice(0, 60),
      className: typeof element.className === "string" ? element.className.slice(0, 160) : "",
      right: Math.round(element.getBoundingClientRect().right),
    })),
  }));
  const overflow = metrics.documentWidth > metrics.viewport;
  failed ||= !response?.ok() || overflow || runtimeErrors.length > 0;
  console.log(JSON.stringify({ route, status: response?.status(), overflow, runtimeErrors, ...metrics }));
  await page.screenshot({ path: `/tmp/mobile-${route.replaceAll("/", "-") || "home"}.png`, fullPage: true });
  await page.close();
}
await browser.close();
if (failed) process.exitCode = 1;
