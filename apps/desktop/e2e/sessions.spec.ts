import { existsSync } from "node:fs";
import path from "node:path";

import { expect, launchApp, test } from "./fixtures";

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
      await expect(app.page.getByRole("main")).toBeVisible();

      await app.page.keyboard.press("Control+N");

      const box = app.page.getByRole("textbox", { name: "Message" });
      await expect(box).toBeFocused();
      await expect(app.page.getByRole("heading", { level: 1, name: "New session" })).toBeVisible();

      await box.fill("Hello from the test");
      await box.press("Enter");

      const transcript = app.page.getByRole("main", { name: "Conversation" });
      await expect(transcript.getByText("Hello from the test", { exact: true })).toBeVisible();
      await expect(transcript.getByText(/^This is the Demo agent\./)).toBeVisible();
      // The whole reply arrives, in pieces, and the reply ends.
      await expect(transcript.getByText(/into the session view\.$/)).toBeVisible({
        timeout: 15_000,
      });
      await expect(transcript.getByText("The Demo agent is replying…")).toBeHidden();
      await expect(transcript.getByText(/You wrote: Hello from the test/)).toBeVisible();
      // The session is named after the first message.
      await expect(app.page.getByRole("link", { name: "Hello from the test" })).toBeVisible();
      await expect(
        app.page.getByRole("heading", { level: 1, name: "Hello from the test" }),
      ).toBeVisible();
      await expect(transcript.locator("time")).toHaveAttribute(
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
      const transcript = app.page.getByRole("main", { name: "Conversation" });
      await expect(transcript.getByText(/^first\nsecond$/).first()).toBeVisible();
    } finally {
      app.kill();
    }
  });
});
