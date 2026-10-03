import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, launchApp, test } from "./fixtures";

const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
/** The workspace's stand-in for Claude Code (ADR 0038), built with the app. */
const standIn =
  process.env["ARDEN_E2E_CLAUDE"] ?? path.join(repoRoot, "target", "debug", "claude-stand-in.exe");

/**
 * A folder that holds the stand-in as `claude.exe`, and the environment that puts it first on the
 * app's `PATH`. Windows spells the variable as it likes, so the one already there is replaced.
 */
function claudeOnPath(settings: Record<string, unknown> = {}) {
  const bin = mkdtempSync(path.join(tmpdir(), "arden-e2e-claude-"));
  copyFileSync(standIn, path.join(bin, "claude.exe"));
  writeFileSync(path.join(bin, "stand-in.json"), JSON.stringify(settings));
  const key = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  return {
    env: { [key]: `${bin};${process.env[key] ?? ""}` },
    remove: () => {
      rmSync(bin, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    },
  };
}

test.describe("Claude in the real app", () => {
  test("a session whose agent is Claude answers through Claude Code", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      await expect(page.getByRole("main")).toBeVisible();
      await page.keyboard.press("Control+N");
      const session = page.getByRole("main", { name: "Session" });
      await expect(session).toBeVisible();

      await page.getByRole("button", { name: "Agent: Demo agent" }).click();
      await page.getByRole("menuitemradio", { name: "Claude" }).click();
      await expect(page.getByRole("button", { name: "Agent: Claude" })).toBeVisible();
      const box = page.getByRole("textbox", { name: "Message" });
      await box.fill("Hello from the test");
      await box.press("Enter");

      await expect(session.getByText("You said: Hello from the test")).toBeVisible({
        timeout: 30_000,
      });
      await expect(session.getByText("Claude is replying…")).toBeHidden();
      await expect(page.getByText("Claude · Playground")).toBeVisible();
    } finally {
      app.kill();
      claude.remove();
    }
  });
});
