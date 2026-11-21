import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect, type Browser } from "@playwright/test";

// Run only against a disposable emulator: this installs the demo and changes radio settings.
const serial = process.env.ANDROID_SERIAL;
if (!serial?.startsWith("emulator-"))
  throw new Error(
    "Set ANDROID_SERIAL to a disposable emulator (for example emulator-5554).",
  );
const sdk = process.env.ANDROID_HOME;
if (!sdk) throw new Error("Set ANDROID_HOME to your Android SDK.");
const adbPath = resolve(sdk, "platform-tools/adb");
const aapt = resolve(sdk, "build-tools/35.0.0/aapt");
const apk = resolve(process.argv[2] ?? "artifacts/campus-navigator-demo.apk");
const adb = (...args: string[]) =>
  execFileSync(adbPath, ["-s", serial, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
const manifest = execFileSync(aapt, ["dump", "badging", apk], {
  encoding: "utf8",
});
const packageId = manifest.match(/^package: name='([^']+)'/m)?.[1];
if (!packageId || !manifest.includes("application-debuggable"))
  throw new Error(
    "Provide a debug APK. Release builds must not expose WebView debugging.",
  );
const permissions = execFileSync(aapt, ["dump", "permissions", apk], {
  encoding: "utf8",
});
if (permissions.includes("android.permission.INTERNET"))
  throw new Error(
    "The offline navigator unexpectedly requests INTERNET permission.",
  );
const evidence = resolve("data/verification/android-device");
await mkdir(evidence, { recursive: true });
const checks: string[] = [];
let browser: Browser | undefined;
let forwardedPort: string | undefined;
const previousAirplane = adb(
  "shell",
  "settings",
  "get",
  "global",
  "airplane_mode_on",
);
const previousWifi = adb("shell", "settings", "get", "global", "wifi_on");
const previousData = adb("shell", "settings", "get", "global", "mobile_data");
async function attach() {
  for (let attempt = 0; attempt < 45; attempt++) {
    let pid: string;
    try {
      pid = adb("shell", "pidof", packageId!);
    } catch {
      await delay(1000);
      continue;
    }
    const sockets = adb("shell", "cat", "/proc/net/unix");
    const socket = sockets.match(
      new RegExp(`@(webview_devtools_remote_${pid})\\b`),
    )?.[1];
    if (socket) {
      forwardedPort = adb("forward", "tcp:0", `localabstract:${socket}`);
      browser = await chromium.connectOverCDP(
        `http://127.0.0.1:${forwardedPort}`,
        { noDefaults: true },
      );
      const context = browser.contexts()[0];
      const page = context.pages()[0] ?? (await context.waitForEvent("page"));
      page.setDefaultTimeout(20_000);
      return page;
    }
    await delay(1000);
  }
  throw new Error("Debug WebView did not become available.");
}
try {
  adb("install", "-r", apk);
  checks.push("APK installation and absence of INTERNET permission");
  adb("shell", "pm", "revoke", packageId, "android.permission.CAMERA");
  adb(
    "shell",
    "pm",
    "clear-permission-flags",
    packageId,
    "android.permission.CAMERA",
    "user-set",
    "user-fixed",
  );
  adb("shell", "cmd", "connectivity", "airplane-mode", "enable");
  adb("shell", "svc", "wifi", "disable");
  adb("shell", "svc", "data", "disable");
  expect(adb("shell", "settings", "get", "global", "airplane_mode_on")).toBe(
    "1",
  );
  adb("shell", "am", "force-stop", packageId);
  adb(
    "shell",
    "am",
    "start",
    "-W",
    "-n",
    `${packageId}/com.campus.navigator.MainActivity`,
  );
  let page = await attach();
  await expect(
    page.getByText("Campus Navigator Demo", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  checks.push(
    "Cold start and 3D rendering with airplane mode enabled and radios disabled",
  );
  await page.getByRole("combobox", { name: "I am at" }).selectOption("gate");
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("CSE HOD");
  await page
    .getByRole("combobox", { name: "Destination", exact: true })
    .selectOption("ring-3");
  await expect(page.getByText("Arrive at CSE HOD Room.")).toBeVisible();
  await page.getByLabel("Step-free route").check();
  await expect(page.getByText("Arrive at CSE HOD Room.")).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, "offline-route.png"),
    fullPage: true,
  });
  checks.push("Offline alias search, routing and step-free routing");
  await page.getByText("Use a location checkpoint", { exact: true }).click();
  await page
    .getByLabel("Printed checkpoint code")
    .fill("campus-location:1:wrong-campus:1:gate");
  await page.getByRole("button", { name: "Read checkpoint code" }).click();
  await expect(page.getByRole("alert")).toContainText("different campus");
  await page
    .getByLabel("Printed checkpoint code")
    .fill("campus-location:1:demonstration-campus:1:gate");
  await page.getByRole("button", { name: "Read checkpoint code" }).click();
  await page.getByRole("button", { name: "I am at this location" }).click();
  await expect(page.getByRole("combobox", { name: "I am at" })).toHaveValue(
    "gate",
  );
  checks.push("Wrong-campus checkpoint rejection and valid checkpoint start");

  // Deny the Android prompt and check the useful fallback.
  await page.getByRole("button", { name: "Scan checkpoint QR" }).click();
  let denied = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    adb("shell", "uiautomator", "dump", "/sdcard/campus-permission.xml");
    const xml = adb("shell", "cat", "/sdcard/campus-permission.xml");
    const node = xml.match(
      /<node[^>]*resource-id="[^"]*:id\/permission_deny_button"[^>]*>/,
    )?.[0];
    const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (bounds) {
      const [, left, top, right, bottom] = bounds.map(Number);
      adb(
        "shell",
        "input",
        "tap",
        String(Math.round((left + right) / 2)),
        String(Math.round((top + bottom) / 2)),
      );
      denied = true;
      break;
    }
    await delay(500);
  }
  if (!denied) throw new Error("Expected a native camera permission prompt.");
  await expect(page.getByRole("alert")).toContainText(
    "Camera access is unavailable",
  );
  await page.getByRole("button", { name: "Close scanner" }).click();
  await expect(page.getByLabel("Printed checkpoint code")).toBeVisible();
  checks.push("Native camera denial keeps manual checkpoint entry available");
  await browser!.close();
  browser = undefined;
  adb("forward", "--remove", `tcp:${forwardedPort}`);
  forwardedPort = undefined;
  adb("shell", "am", "force-stop", packageId);
  adb(
    "shell",
    "am",
    "start",
    "-W",
    "-n",
    `${packageId}/com.campus.navigator.MainActivity`,
  );
  page = await attach();
  await expect(
    page.getByText("Campus Navigator Demo", { exact: true }),
  ).toBeVisible();
  checks.push("Second offline process cold start");
  await writeFile(
    resolve(evidence, "verification.json"),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        status: "passed",
        serial,
        packageId,
        android: adb("shell", "getprop", "ro.build.version.release"),
        checks,
        limitation:
          "Emulator evidence only; physical camera scans and real-campus accuracy remain unverified.",
      },
      null,
      2,
    ),
  );
  console.log(`Passed ${checks.length} Android checks. Evidence: ${evidence}`);
} catch (error) {
  const logcat = adb("logcat", "-d", "-t", "500");
  await writeFile(resolve(evidence, "logcat.txt"), logcat);
  await writeFile(
    resolve(evidence, "verification.json"),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        status: "failed",
        checks,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  console.error(
    logcat
      .split("\n")
      .filter((line) => /AndroidRuntime|chromium|FATAL|Exception/.test(line))
      .join("\n"),
  );
  throw error;
} finally {
  await browser?.close().catch(() => {});
  if (forwardedPort) adb("forward", "--remove", `tcp:${forwardedPort}`);
  adb(
    "shell",
    "cmd",
    "connectivity",
    "airplane-mode",
    previousAirplane === "1" ? "enable" : "disable",
  );
  adb("shell", "svc", "wifi", previousWifi === "1" ? "enable" : "disable");
  adb("shell", "svc", "data", previousData === "1" ? "enable" : "disable");
}
