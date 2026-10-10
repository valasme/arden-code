import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";
import { z } from "zod";

import { expect, launchApp, pathKey, pathWithoutAgents, test } from "./fixtures";

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
  return {
    env: { [pathKey]: `${bin};${pathWithoutAgents()}` },
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
  // Claude may be the agent already, once the app has found the stand-in (ADR 0039).
  await page.getByRole("button", { name: /^Agent: / }).click();
  await page.getByRole("menuitemradio", { name: "Claude" }).click();
  await expect(page.getByRole("button", { name: "Agent: Claude" })).toBeVisible();
  return session;
}

/** What the stand-in notes each time it is started. */
const started = z.object({ args: z.array(z.string()) });

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
      // Once the session has a message, its header names its agent and project (ADR 0044).
      const header = page
        .getByRole("heading", { level: 1, name: "Hello from the test" })
        .locator("..");
      await expect(header.getByText("Claude", { exact: true })).toBeVisible();
      await expect(header.getByText("Playground", { exact: true })).toBeVisible();
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

  test("Claude asks a question, and goes on with the answer the person chose", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);
      await say(page, "Ask me which library");

      const card = session.getByRole("form", { name: "Claude asks you" });
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Claude: waiting for your answer")).toBeVisible();
      await card.getByRole("radio", { name: "Vue" }).check();
      await card.getByRole("button", { name: "Send answers" }).click();

      await expect(session.getByText("You chose Vue.")).toBeVisible({ timeout: 30_000 });
      await expect(card).toBeHidden();
      await expect(session.getByText("Claude is replying…")).toBeHidden();
    } finally {
      app.kill();
      claude.remove();
    }
  });

  test("the message box shows the usage limits Claude Code reports", async () => {
    const claude = claudeOnPath({
      usage: {
        subscription_type: "max",
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 42, resets_at: "2099-10-09T15:10:00+00:00" },
          seven_day: { utilization: 18, resets_at: "2099-10-13T09:00:00+00:00" },
        },
      },
    });
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;

      // Asked once Arden Code has found Claude Code after it started, with no session open: the
      // welcome screen's message box, for Claude, shows them before Send (ADR 0044).
      const figures = page.getByRole("button", { name: "5-hour 42% Weekly 18%" });
      await expect(figures).toBeVisible({ timeout: 30_000 });
      await figures.click();
      const details = page.getByRole("dialog", { name: "Usage limits" });
      await expect(details.getByText("Weekly limit")).toBeVisible();
      await expect(page.locator('[data-area="statusbar"]').getByText(/5-hour/u)).toBeHidden();
    } finally {
      app.kill();
      claude.remove();
    }
  });

  test("the message box shows how full a Claude session's context window is after a reply", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);

      await say(page, "Hello from the test");
      await expect(session.getByText("You said: Hello from the test")).toBeVisible({
        timeout: 30_000,
      });

      // Claude Code reports its context window once the reply has ended (ADR 0044).
      const figures = page.getByRole("button", { name: /^Context 13%/u });
      await expect(figures).toBeVisible({ timeout: 30_000 });
      await figures.click();
      const details = page.getByRole("dialog", { name: "Context window" });
      await expect(details.getByText("13% used: 26K of 200K tokens")).toBeVisible();
    } finally {
      app.kill();
      claude.remove();
    }
  });

  test("Claude Code starts in the permission mode chosen, and takes another at once", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "arden-e2e-data-"));
    const log = path.join(dataDir, "claude.log");
    const claude = claudeOnPath({ log });
    const app = await launchApp({ dataDir, env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);

      await page.getByRole("button", { name: "Permission mode: Manual" }).click();
      await page.getByRole("menuitemradio", { name: /^Plan/u }).click();
      await expect(page.getByRole("button", { name: "Permission mode: Plan" })).toBeVisible();
      await say(page, "Which mode are you in?");
      await expect(session.getByText("The permission mode is plan.")).toBeVisible({
        timeout: 30_000,
      });

      // The running Claude Code takes the new mode without starting again (ADR 0044).
      await page.getByRole("button", { name: "Permission mode: Plan" }).click();
      await page.keyboard.press("2");
      await expect(
        page.getByRole("button", { name: "Permission mode: Accept edits" }),
      ).toBeVisible();
      await say(page, "Which mode now?");
      await expect(session.getByText("The permission mode is acceptEdits.")).toBeVisible({
        timeout: 30_000,
      });

      // Next permission mode, from the keyboard (ADR 0044).
      await page.keyboard.press("Control+Shift+M");
      await expect(page.getByRole("button", { name: "Permission mode: Plan" })).toBeVisible();

      const conversations = readFileSync(log, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("start "))
        .map((line) => started.parse(JSON.parse(line.slice("start ".length))).args)
        .filter((args) => args.includes("-p") && !args.includes("--no-session-persistence"));
      expect(conversations).toHaveLength(1);
      const [first] = conversations;
      expect(first?.[(first?.indexOf("--permission-mode") ?? -2) + 1]).toBe("plan");
    } finally {
      app.kill();
      claude.remove();
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  });

  test("Bypass permissions, once allowed, starts Claude Code again so that it can, and turning it off goes back to Manual", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "arden-e2e-data-"));
    const log = path.join(dataDir, "claude.log");
    const claude = claudeOnPath({ log });
    const app = await launchApp({ dataDir, env: claude.env });
    /** Turns Settings → Agents → Allow Bypass permissions on or off, and comes back to the session. */
    const allowBypass = async (allowed: boolean) => {
      await app.page.getByRole("link", { name: "Settings" }).click();
      await app.page.getByRole("link", { name: "Agents", exact: true }).click();
      const toggle = app.page.getByRole("switch", { name: "Allow Bypass permissions" });
      await toggle.click();
      await expect(toggle).toBeChecked({ checked: allowed });
      await app.page.getByRole("link", { name: "Back" }).click();
    };
    try {
      const { page } = app;
      const session = await claudeSession(page);
      await say(page, "Which mode are you in?");
      await expect(session.getByText("The permission mode is default.")).toBeVisible({
        timeout: 30_000,
      });

      await allowBypass(true);
      await page.getByRole("button", { name: "Permission mode: Manual" }).click();
      await page.getByRole("menuitemradio", { name: /^Bypass permissions/u }).click();
      const bypassed = page.getByRole("button", { name: "Permission mode: Bypass permissions" });
      await expect(bypassed).toBeVisible();
      await say(page, "Which mode now?");
      await expect(session.getByText("The permission mode is bypassPermissions.")).toBeVisible({
        timeout: 30_000,
      });

      const conversations = readFileSync(log, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("start "))
        .map((line) => started.parse(JSON.parse(line.slice("start ".length))).args)
        .filter((args) => args.includes("-p") && !args.includes("--no-session-persistence"));
      expect(conversations).toHaveLength(2);
      expect(conversations[0]).not.toContain("--allow-dangerously-skip-permissions");
      expect(conversations[1]).toContain("--allow-dangerously-skip-permissions");
      expect(conversations[1]).toContain("--resume");

      await allowBypass(false);
      await expect(page.getByRole("button", { name: "Permission mode: Manual" })).toBeVisible();
      await say(page, "Which mode at last?");
      await expect(session.getByText("The permission mode is default.").nth(1)).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      app.kill();
      claude.remove();
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  });

  test("Claude's plan is shown, and starting it accepting edits changes the session's mode", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);
      await page.getByRole("button", { name: "Permission mode: Manual" }).click();
      await page.getByRole("menuitemradio", { name: /^Plan/u }).click();
      await expect(page.getByRole("button", { name: "Permission mode: Plan" })).toBeVisible();

      await say(page, "Plan the fix");
      const card = session.getByRole("group", { name: "Claude has a plan" });
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card.getByRole("heading", { name: "The fix" })).toBeVisible();
      await card.getByRole("button", { name: "Start, accepting edits" }).click();

      await expect(session.getByText("Started the plan in acceptEdits.")).toBeVisible({
        timeout: 30_000,
      });
      await expect(session.getByText("You started the plan, accepting edits")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Permission mode: Accept edits" }),
      ).toBeVisible();
    } finally {
      app.kill();
      claude.remove();
    }
  });

  test("a Claude session carries on its conversation after Arden Code restarts", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "arden-e2e-data-"));
    const log = path.join(dataDir, "claude-starts.log");
    const claude = claudeOnPath({ log });
    try {
      const first = await launchApp({ dataDir, env: claude.env });
      const session = await claudeSession(first.page);
      await say(first.page, "Hello from the test");
      await expect(session.getByText("You said: Hello from the test")).toBeVisible({
        timeout: 30_000,
      });
      await first.close();

      const second = await launchApp({ dataDir, env: claude.env });
      try {
        const { page } = second;
        await page.getByRole("link", { name: "Hello from the test" }).click();
        // The session as it was saved, with Claude's earlier reply.
        const reopened = page.getByRole("main", { name: "Session" });
        await expect(reopened.getByText("You said: Hello from the test")).toBeVisible();
        await say(page, "Hello again");
        await expect(reopened.getByText("You said: Hello again")).toBeVisible({
          timeout: 30_000,
        });
      } finally {
        second.kill();
      }

      const starts = readFileSync(log, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("start "))
        .map((line) => started.parse(JSON.parse(line.slice("start ".length))).args);
      // The starts of a conversation, not the look at Claude Code's version, and not the one that
      // only lists what Claude Code can do (ADR 0042).
      const conversations = starts.filter(
        (args) => args.includes("-p") && !args.includes("--no-session-persistence"),
      );
      expect(conversations).toHaveLength(2);
      const [fresh, resumed] = conversations;
      const id = fresh?.[fresh.indexOf("--session-id") + 1];
      expect(id).toMatch(/^[0-9a-f-]{36}$/u);
      expect(resumed?.[resumed.indexOf("--resume") + 1]).toBe(id);
    } finally {
      claude.remove();
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  });

  test("Ctrl+O opens a folder, and Claude works there once the folder is trusted", async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "arden-e2e-project-"));
    const log = path.join(folder, "..", `${path.basename(folder)}-claude.log`);
    const claude = claudeOnPath({ log });
    const app = await launchApp({
      env: { ...claude.env, ARDEN_CODE_FOLDER_DIALOG_ANSWER: folder },
    });
    try {
      const { page } = app;
      await expect(page.getByRole("main")).toBeVisible();
      await page.keyboard.press("Control+O");
      const name = path.basename(folder);
      await expect(page.getByRole("button", { name: `Project: ${name}` })).toBeVisible();
      // Open folder starts a session there: its menus are the ones to use, not the welcome
      // screen's, which may still show the folder for a moment before the session opens.
      const session = page.getByRole("main", { name: "Session" });
      await expect(session).toBeVisible();
      await page.getByRole("button", { name: /^Agent: / }).click();
      await page.getByRole("menuitemradio", { name: "Claude" }).click();
      await say(page, "Hello in the folder");

      const question = page.getByRole("alertdialog", { name: `Trust “${name}”?` });
      await expect(question).toBeVisible();
      await question.getByRole("button", { name: "Trust folder" }).click();

      await expect(session.getByText("You said: Hello in the folder")).toBeVisible({
        timeout: 30_000,
      });
      const folders = readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("start "))
        .map((line) => z.object({ folder: z.string() }).parse(JSON.parse(line.slice(6))).folder);
      expect(folders.map((where) => where.toLowerCase())).toContain(folder.toLowerCase());
    } finally {
      app.kill();
      claude.remove();
      rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      rmSync(log, { force: true });
    }
  });

  test("archiving a Claude session ends its Claude Code", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "arden-e2e-data-"));
    const log = path.join(dataDir, "claude.log");
    const claude = claudeOnPath({ log });
    const app = await launchApp({ dataDir, env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);
      await say(page, "Hello before archiving");
      await expect(session.getByText("You said: Hello before archiving")).toBeVisible({
        timeout: 30_000,
      });
      const ended = () =>
        readFileSync(log, "utf8")
          .split("\n")
          .some((line) => line.trim() === "end");
      expect(ended(), "Claude Code is kept between turns").toBe(false);

      await page.getByRole("button", { name: "Session actions" }).click();
      await page.getByRole("menuitem", { name: "Archive" }).click();

      await expect.poll(ended, { timeout: 15_000 }).toBe(true);
    } finally {
      app.kill();
      claude.remove();
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  });

  test("a slash lists Claude Code's slash commands, and Tab fills one in", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      await claudeSession(page);
      const box = page.getByRole("textbox", { name: "Message" });

      // Claude Code says its commands when a Claude Code has been started only to hear them.
      await box.fill("/gre");
      const greet = page.getByRole("option", { name: /stand-in-skill:greet/u });
      await expect(greet).toBeVisible({ timeout: 30_000 });
      await box.press("Tab");
      await expect(box).toHaveValue("/stand-in-skill:greet ");

      await box.fill("/comp");
      await expect(page.getByRole("option", { name: /\/compact/u })).toBeVisible();
      await box.press("Escape");
      await expect(page.getByRole("listbox")).toBeHidden();
      await expect(box).toHaveValue("/comp");
    } finally {
      app.kill();
      claude.remove();
    }
  });

  test("an older model that Claude Code lists is chosen by its full id and passed to it", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "arden-e2e-data-"));
    const log = path.join(dataDir, "claude.log");
    const claude = claudeOnPath({ log });
    const app = await launchApp({ dataDir, env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);

      await page.getByRole("button", { name: /^Model: / }).click();
      const older = page.getByRole("menuitemradio", { name: /Stand-in 1/u });
      await expect(older).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Older models")).toBeVisible();
      await older.click();
      await expect(page.getByRole("button", { name: "Model: Stand-in 1" })).toBeVisible();
      await say(page, "Hello with an older model");
      await expect(session.getByText("You said: Hello with an older model")).toBeVisible({
        timeout: 30_000,
      });

      const conversation = readFileSync(log, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("start "))
        .map((line) => started.parse(JSON.parse(line.slice("start ".length))).args)
        .find((args) => args.includes("-p") && !args.includes("--no-session-persistence"));
      expect(conversation?.[(conversation?.indexOf("--model") ?? -2) + 1]).toBe(
        "claude-stand-in-1",
      );
    } finally {
      app.kill();
      claude.remove();
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  });

  test("/model is run by Arden Code, and not sent to Claude Code", async () => {
    const claude = claudeOnPath();
    const app = await launchApp({ env: claude.env });
    try {
      const { page } = app;
      const session = await claudeSession(page);
      // The models are known once Claude Code has said them: the menu lists them.
      await page.getByRole("button", { name: /^Model: / }).click();
      await expect(page.getByRole("menuitemradio", { name: /Stand-in Small/u })).toBeVisible({
        timeout: 30_000,
      });
      await page.keyboard.press("Escape");
      const box = page.getByRole("textbox", { name: "Message" });
      await box.fill("/model stand-in-small");
      await box.press("Enter");

      await expect(page.getByRole("button", { name: "Model: Stand-in Small" })).toBeVisible();
      await expect(session.getByText("You said:")).toBeHidden();
    } finally {
      app.kill();
      claude.remove();
    }
  });
});
