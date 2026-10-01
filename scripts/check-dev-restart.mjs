// Checks by hand what CI cannot: that `pnpm dev` keeps serving Arden Code when the app
// starts itself again, after a plain restart and after Reset Arden Code, and ends when the app is
// closed. Run it after changing how the app restarts: `pnpm check:dev-restart` (docs/dev-setup.md).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const { chromium } = createRequire(path.join(root, "apps", "desktop", "package.json"))(
  "@playwright/test",
);
const devServer = "http://localhost:1420/";
// A build folder of its own, so the check leaves alone the debug build that the e2e tests use.
const targetDir = path.join(root, "target", "dev-check");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function powershell(command) {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
  }).trim();
}

/** The ids of running Arden Code processes, of this check's own build only when `ours`. */
function appProcesses(ours) {
  const filter = ours ? `| Where-Object { $_.ExecutablePath -like '*\\target\\dev-check\\*' }` : "";
  const ids = powershell(
    `@(Get-CimInstance Win32_Process -Filter "Name = 'arden-code.exe'" ${filter} | ForEach-Object { $_.ProcessId }) -join ','`,
  );
  return ids ? ids.split(",").map(Number) : [];
}

function killTree(pid) {
  try {
    execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // Already gone.
  }
}

async function serves(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

/** A port nothing is using, for the web engine's debugging endpoint. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/* oxlint-disable no-await-in-loop -- waiting is sequential by nature */
/** Whether `condition` came to hold within `ms`. */
async function until(condition, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await sleep(250);
  }
  return false;
}

/** The app's page, once a start of the app shows it from the dev server. */
async function attach(port, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      const page = await (async () => {
        for (let tries = 0; tries < 100; tries += 1) {
          const found = browser.contexts()[0]?.pages()[0];
          if (found) return found;
          await sleep(100);
        }
        return undefined;
      })();
      if (page) {
        await page.waitForURL(/^http:\/\/localhost:1420\//, { timeout: 20_000 });
        await page.getByRole("link", { name: "Settings" }).waitFor({ timeout: 20_000 });
        return { browser, page };
      }
      await browser.close();
    } catch {
      // The web engine is not listening yet, or the page is not the app's yet.
    }
    await sleep(250);
  }
  throw new Error(`no start of the app showed its page from the dev server on port ${port}`);
}
/* oxlint-enable no-await-in-loop */

async function openAdvanced(page) {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Advanced", exact: true }).click();
}

function settings(data) {
  const file = path.join(data, "config", "settings.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

function check(condition, what) {
  if (!condition) throw new Error(what);
}

const scenarios = [
  {
    name: "a restart for a setting that needs one",
    async act(page) {
      await openAdvanced(page);
      await page.getByRole("switch", { name: "Hardware acceleration" }).click();
      await page
        .getByRole("alertdialog", { name: "Restart Arden Code?" })
        .getByRole("button", { name: "Restart now" })
        .click();
    },
    verify(data) {
      check(settings(data)?.advanced.hardwareAcceleration === false, "the setting was kept");
    },
  },
  {
    name: "Reset Arden Code",
    async act(page, data) {
      await openAdvanced(page);
      await page.keyboard.press("Control+=");
      await until(() => settings(data)?.appearance.zoom === 110, 10_000);
      await page.getByRole("button", { name: "Reset Arden Code" }).click();
      await page
        .getByRole("alertdialog", { name: "Reset Arden Code?" })
        .getByRole("button", { name: "Reset Arden Code" })
        .click();
    },
    verify(data) {
      check(!existsSync(path.join(data, "local", "reset-requested")), "the reset finished");
      check((settings(data)?.appearance.zoom ?? 100) === 100, "the settings were reset");
    },
  },
];

async function run(scenario) {
  const data = mkdtempSync(path.join(tmpdir(), "arden-dev-check-"));
  const port = await freePort();
  const env = {
    ...process.env,
    CI: "true",
    CARGO_TARGET_DIR: targetDir,
    ARDEN_CODE_DATA_DIR: data,
    ARDEN_CODE_DEBUG_PORT: String(port),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  };
  delete env["WEBVIEW2_USER_DATA_FOLDER"];
  // pnpm is a .cmd file, which only a shell runs.
  const dev = spawn("pnpm dev", { cwd: root, env, shell: true });
  let output = "";
  dev.stdout.on("data", (chunk) => (output += chunk));
  dev.stderr.on("data", (chunk) => (output += chunk));
  let ended = false;
  dev.on("exit", () => (ended = true));

  try {
    let { browser, page } = await attach(port, 15 * 60_000);
    await scenario.act(page, data);
    await browser.close().catch(() => {});

    ({ browser, page } = await attach(port, 60_000));
    check(!ended, "`pnpm dev` still runs");
    check(await serves(devServer), "the dev server still serves");
    scenario.verify(data);

    // Closing the app ends `pnpm dev`, as it would without a restart.
    await page.getByRole("button", { name: "Close" }).click();
    check(await until(() => ended, 30_000), "closing the app ends `pnpm dev`");
    check(appProcesses(true).length === 0, "no start of the app is left running");
    console.log(`  ✓ ${scenario.name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${scenario.name}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(output.split("\n").slice(-15).join("\n"));
    return false;
  } finally {
    if (!ended) killTree(dev.pid);
    for (const pid of appProcesses(true)) killTree(pid);
    if (await serves(devServer)) {
      const owner = powershell(
        "(Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue).OwningProcess",
      );
      for (const pid of owner.split(/\s+/).filter(Boolean)) killTree(pid);
    }
    await sleep(1000);
    rmSync(data, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

if (process.platform !== "win32") throw new Error("Arden Code runs on Windows only.");
if (await serves(devServer)) {
  throw new Error(`Something already serves ${devServer}: stop your own \`pnpm dev\` first.`);
}
if (appProcesses(false).length > 0) {
  throw new Error(
    "Arden Code is running: close it first, or the check's app would hand over to it.",
  );
}
console.log(
  `Checking that \`pnpm dev\` survives a restart. The first run builds the app in ${targetDir}, which takes a few minutes.`,
);
let passed = true;
for (const scenario of scenarios) {
  // oxlint-disable-next-line no-await-in-loop -- one `pnpm dev` at a time, on vite's one port
  passed = (await run(scenario)) && passed;
}
process.exit(passed ? 0 : 1);
