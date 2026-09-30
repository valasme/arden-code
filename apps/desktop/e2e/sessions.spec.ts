import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import type { Locator, Page } from "@playwright/test";

import { expect, launchApp, openDevPage, test } from "./fixtures";

/** Starts a session and sends a message, and returns the conversation. */
async function ask(page: Page, message: string) {
  await expect(page.getByRole("main")).toBeVisible();
  await page.keyboard.press("Control+N");
  const box = page.getByRole("textbox", { name: "Message" });
  await expect(box).toBeFocused();
  await box.fill(message);
  await box.press("Enter");
  return page.getByRole("main", { name: "Conversation" });
}

/** The reply is over when the last line of the Demo agent's text has arrived. */
async function untilTheReplyEnds(conversation: Locator) {
  await expect(conversation.getByText(/shows how an unusual link asks first/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(conversation.getByText("The Demo agent is replying…")).toBeHidden();
}

test.describe("sessions in the real app", () => {
  test("the first launch makes the Playground folder and shows it, and the welcome state", async () => {
    const app = await launchApp();
    try {
      await expect(
        app.page.getByRole("heading", {
          level: 1,
          name: "Real agents are coming. Try the Demo agent.",
        }),
      ).toBeVisible();

      expect(existsSync(path.join(app.dataDir, "local", "playground"))).toBe(true);
      const sidebar = app.page.getByRole("complementary", { name: "Sidebar" });
      await expect(sidebar.getByRole("heading", { name: "Playground" })).toBeVisible();
      await expect(sidebar.getByText("No sessions yet.")).toBeVisible();
    } finally {
      app.kill();
    }
  });

  test("Ctrl+N starts a Demo agent session, and a message streams a reply from Rust", async () => {
    const app = await launchApp();
    try {
      const conversation = await ask(app.page, "Hello from the test");

      await expect(
        app.page.getByRole("heading", { level: 1, name: "Hello from the test" }),
      ).toBeVisible();
      await expect(conversation.getByText("Hello from the test", { exact: true })).toBeVisible();
      await expect(conversation.getByText(/^This is the Demo agent\./).first()).toBeVisible();
      // The whole reply arrives, in pieces, and the reply ends.
      await untilTheReplyEnds(conversation);
      // The session is named after the first message.
      await expect(app.page.getByRole("link", { name: "Hello from the test" })).toBeVisible();
      await expect(conversation.locator("time").first()).toHaveAttribute(
        "datetime",
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
      );
    } finally {
      app.kill();
    }
  });

  test("Shift+Enter adds a line, and Enter sends it all", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();
      await app.page.getByRole("button", { name: "New session" }).click();
      const box = app.page.getByRole("textbox", { name: "Message" });
      await expect(box).toBeFocused();

      await app.page.keyboard.type("first");
      await app.page.keyboard.press("Shift+Enter");
      await app.page.keyboard.type("second");

      await expect(box).toHaveValue("first\nsecond");
      await app.page.keyboard.press("Enter");
      const conversation = app.page.getByRole("main", { name: "Conversation" });
      await expect(conversation.getByText(/^first\nsecond$/).first()).toBeVisible();
    } finally {
      app.kill();
    }
  });
});

test.describe("rich replies in the real app", () => {
  test("shows thinking, tool calls, file changes and status markers as cards", async () => {
    const app = await launchApp();
    try {
      const conversation = await ask(app.page, "Show me everything");
      await untilTheReplyEnds(conversation);

      await expect(conversation.getByText("The agent started working")).toBeVisible();
      const thinking = conversation.locator("details");
      await expect(thinking).toHaveCount(1);
      await expect(thinking).not.toHaveAttribute("open", "");
      await thinking.getByText("Thinking").click();
      await expect(thinking.getByText(/I will not do any real work/)).toBeVisible();

      await expect(conversation.getByText("read_file")).toBeVisible();
      await expect(conversation.getByText("42 lines")).toBeVisible();
      await expect(conversation.getByText("run_command")).toBeVisible();
      await expect(conversation.getByText("Failed", { exact: true })).toBeVisible();

      const files = [
        ["Created", "notes/demo.md"],
        ["Changed", "src/main.ts"],
        ["Deleted", "old/notes.txt"],
      ] as const;
      await Promise.all(
        files.flatMap(([kind, file]) => [
          expect(conversation.getByText(kind, { exact: true })).toBeVisible(),
          expect(conversation.getByText(file, { exact: true })).toBeVisible(),
        ]),
      );
    } finally {
      app.kill();
    }
  });

  test("draws Markdown, highlights code and copies it with the button", async () => {
    const app = await launchApp();
    try {
      const conversation = await ask(app.page, "Show me code");
      await untilTheReplyEnds(conversation);

      await expect(
        conversation.getByRole("heading", { level: 2, name: "What a reply can show" }),
      ).toBeVisible();
      await expect(conversation.getByRole("cell", { name: "A card with counts" })).toBeVisible();
      const code = conversation.getByRole("region", { name: "Code (ts)" });
      // The colors arrive when the grammar has loaded.
      await expect(code.locator("code span[style]").first()).toBeVisible();

      await conversation.getByRole("button", { name: "Copy code" }).click();

      await expect(conversation.getByRole("status").filter({ hasText: "Copied" })).toHaveCount(1);
      const copied = execFileSync("powershell", ["-NoProfile", "-Command", "Get-Clipboard -Raw"], {
        encoding: "utf8",
      });
      expect(copied).toContain("function greet(name: string): string {");
      expect(copied).toContain("return `Hello, ${name}!`;");
    } finally {
      app.kill();
    }
  });

  test("asks before opening a link that is not a web address, and leaves the window alone", async () => {
    const app = await launchApp();
    try {
      const conversation = await ask(app.page, "Show me links");
      await untilTheReplyEnds(conversation);
      const before = app.page.url();

      await conversation.getByRole("link", { name: "Write to the team" }).click();

      const dialog = app.page.getByRole("alertdialog", { name: "Open this link?" });
      await expect(dialog.getByText(/mailto:hello@example\.com/)).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      expect(app.page.url()).toBe(before);
      // A web address shows where it goes. It is not clicked here: that would start a browser.
      await expect(conversation.getByRole("link", { name: "links" })).toHaveAttribute(
        "href",
        "https://github.com/valasme/arden-code",
      );
    } finally {
      app.kill();
    }
  });

  test("refuses to navigate the window away from the app itself", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();
      const before = app.page.url();

      await app.page.evaluate(() => {
        window.location.href = "https://example.com/";
      });
      await app.page.waitForTimeout(1500);

      expect(app.page.url()).toBe(before);
      await expect(app.page.getByRole("main")).toBeVisible();
    } finally {
      app.kill();
    }
  });

  test("a message about an error ends the reply with an error", async () => {
    const app = await launchApp();
    try {
      const conversation = await ask(app.page, "Show me an error");

      await expect(conversation.getByText("You asked for an error", { exact: false })).toBeVisible({
        timeout: 20_000,
      });
      await expect(conversation.getByText("The reply stopped.")).toBeVisible();
    } finally {
      app.kill();
    }
  });
});

test.describe("stopping a reply and long sessions in the real app", () => {
  test("Esc stops the reply, and the turn says it was stopped", async () => {
    const app = await launchApp();
    try {
      const conversation = await ask(app.page, "Show me everything");
      await expect(conversation.getByText("The agent started working")).toBeVisible();
      await expect(conversation.getByText("The Demo agent is replying…")).toBeVisible();

      await app.page.keyboard.press("Escape");

      await expect(conversation.getByText("You stopped the reply")).toBeVisible();
      await expect(conversation.getByText("The Demo agent is replying…")).toBeHidden();
      // Nothing more arrives after the stop.
      const length = (await conversation.textContent())?.length ?? 0;
      await app.page.waitForTimeout(1500);
      expect((await conversation.textContent())?.length).toBe(length);
      // And the next message can be sent.
      const box = app.page.getByRole("textbox", { name: "Message" });
      await box.fill("Again");
      await box.press("Enter");
      await expect(conversation.getByText("Again", { exact: true })).toBeVisible();
    } finally {
      app.kill();
    }
  });

  test("a session of 10,000 messages draws only a screenful and scrolls smoothly", async () => {
    const app = await launchApp();
    try {
      await openDevPage(app, "/dev/errors");
      await app.page.getByRole("button", { name: "Make a session of 10,000 messages" }).click();
      const conversation = app.page.getByRole("main", { name: "Conversation" });

      await expect(conversation.getByText("Message number 10000")).toBeVisible({ timeout: 30_000 });
      expect(await conversation.locator("article").count()).toBeLessThan(60);

      await conversation.evaluate((element) => {
        element.scrollTop = 0;
      });
      await expect(conversation.getByText("Message number 1", { exact: true })).toBeVisible();
      await expect(app.page.getByRole("button", { name: "Jump to latest" })).toBeVisible();
      // Scroll through the session a frame at a time, and look at how long the frames took.
      const frames = await conversation.evaluate(async (element) => {
        const durations: number[] = [];
        const step = (element.scrollHeight - element.clientHeight) / 300;
        let last = performance.now();
        for (let index = 0; index < 300; index += 1) {
          // oxlint-disable-next-line no-await-in-loop -- each frame follows the one before
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              element.scrollTop += step;
              resolve();
            });
          });
          const now = performance.now();
          durations.push(now - last);
          last = now;
        }
        return durations;
      });
      const sorted = frames.toSorted((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      // Sixty frames a second is 16.7 ms a frame. A shared machine gets more room; a version that
      // drew all 10,000 messages would take far longer than this for every frame.
      expect(p95, `95% of frames took at most ${p95.toFixed(1)} ms`).toBeLessThan(50);

      await app.page.getByRole("button", { name: "Jump to latest" }).click();
      await expect(conversation.getByText("Message number 10000")).toBeVisible();
      await expect(app.page.getByRole("button", { name: "Jump to latest" })).toBeHidden();
    } finally {
      app.kill();
    }
  });
});
