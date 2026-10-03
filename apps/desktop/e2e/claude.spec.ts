import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";

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

/** Starts a session, makes Claude its agent, and returns the session view. */
async function claudeSession(page: Page) {
  await expect(page.getByRole("main")).toBeVisible();
  await page.keyboard.press("Control+N");
  const session = page.getByRole("main", { name: "Session" });
  await expect(session).toBeVisible();
  await page.getByRole("button", { name: "Agent: Demo agent" }).click();
  await page.getByRole("menuitemradio", { name: "Claude" }).click();
  await expect(page.getByRole("button", { name: "Agent: Claude" })).toBeVisible();
  return session;
}

/** Writes a message in the message box and sends it. */
async function say(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message" });
  await box.fill(text);
  await box.press("Enter");
}

test.describe("Claude in the real app", () => {
  test("a session whose agent is Claude answers through Claude Code", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);

      await say(page, "Hello from the test");

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

  test("Esc stops a Claude reply, and the same Claude Code answers the next message", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);
      await say(page, "Write slowly");
      await expect(session.getByText(/word word/u)).toBeVisible({ timeout: 30_000 });

      await page.keyboard.press("Escape");

      await expect(session.getByText("You stopped the reply")).toBeVisible();
      await expect(session.getByText("Claude is replying…")).toBeHidden();
      await say(page, "Hello again");
      await expect(session.getByText("You said: Hello again")).toBeVisible({ timeout: 30_000 });
    } finally {
      app.kill();
      claude.remove();
    }
  });

  test("Claude asks before it runs a command, and goes on once allowed", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);
      await say(page, "Run the tests");

      const card = session.getByRole("group", { name: "Claude wants to run a command" });
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card.getByText("npm test", { exact: true })).toBeVisible();
      await expect(page.getByText("Claude: waiting for your answer")).toBeVisible();
      await card.getByRole("button", { name: "Allow", exact: true }).click();

      await expect(session.getByText("The tests passed.")).toBeVisible({ timeout: 30_000 });
      await expect(session.getByText("You allowed")).toBeVisible();
      await expect(session.getByText("Claude is replying…")).toBeHidden();
    } finally {
      app.kill();
      claude.remove();
    }
  });

  test("denying a request stops the reply, and Claude answers the next message", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);
      await say(page, "Run the tests");
      const card = session.getByRole("group", { name: "Claude wants to run a command" });
      await expect(card).toBeVisible({ timeout: 30_000 });

      await card.getByRole("button", { name: "Deny" }).click();

      await expect(session.getByText("You denied")).toBeVisible();
      await expect(session.getByText("Claude is replying…")).toBeHidden();
      await say(page, "Hello again");
      await expect(session.getByText("You said: Hello again")).toBeVisible({ timeout: 30_000 });
    } finally {
      app.kill();
      claude.remove();
    }
  });
});
