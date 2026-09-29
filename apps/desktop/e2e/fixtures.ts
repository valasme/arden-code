import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type Page, chromium, test as base } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The debug build from `pnpm build:debug`. Set ARDEN_E2E_EXE to test another build. */
const executable =
  process.env["ARDEN_E2E_EXE"] ?? path.join(repoRoot, "target", "debug", "arden-code.exe");

const debugPort = 9222;

/** What the app printed, so a failure can say why the app did not start. */
function collectOutput(app: ChildProcess): () => string {
  const chunks: string[] = [];
  app.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  app.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  return () => chunks.join("").trim();
}

/* oxlint-disable no-await-in-loop -- polling is sequential by nature */
async function waitForDebugEndpoint(app: ChildProcess, output: () => string) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) {
      throw new Error(`Arden Code exited early with code ${app.exitCode}\n${output()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) return;
    } catch {
      // The web engine is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Arden Code did not open its debugging port within 30 seconds\n${output() || "(no output)"}`,
  );
}
/* oxlint-enable no-await-in-loop */

export const test = base.extend<{ appPage: Page }>({
  // Playwright requires fixtures to destructure their first argument, even when empty.
  // oxlint-disable-next-line no-empty-pattern
  appPage: async ({}, provide) => {
    const profile = mkdtempSync(path.join(tmpdir(), "arden-e2e-"));
    const app = spawn(executable, [], {
      env: {
        ...process.env,
        WEBVIEW2_USER_DATA_FOLDER: profile,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = collectOutput(app);
    try {
      await waitForDebugEndpoint(app, output);
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
      const page = browser.contexts()[0]?.pages()[0];
      if (!page) throw new Error("the app has no page to attach to");
      await provide(page);
      await browser.close();
    } finally {
      if (app.pid !== undefined) {
        // The app's web engine runs as child processes; end the whole tree.
        try {
          execFileSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
        } catch {
          // Already gone.
        }
      }
      // Cleaning up the temporary profile is best effort. It must never hide the test's own error,
      // and the web engine can hold files for a moment after it is told to stop.
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        // The system's temporary folder is cleaned up eventually.
      }
    }
  },
});

export { expect } from "@playwright/test";
