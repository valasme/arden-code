import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";

import { expect, launchApp, test } from "./fixtures";

/** A debug build writes its notifications to this file instead of showing them. */
const notificationsFile = "ARDEN_CODE_NOTIFICATIONS_FILE";

async function openNotifications(page: Page) {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
}

const sent = (file: string) =>
  existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];

test.describe("notifications in the real app", () => {
  test("a test notification is sent with the name of the app, and none with notifications off", async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "arden-e2e-notifications-"));
    const file = path.join(folder, "sent.txt");
    const app = await launchApp({ env: { [notificationsFile]: file } });
    try {
      await openNotifications(app.page);
      const desktop = app.page.getByRole("switch", { name: "Desktop notifications" });
      await expect(desktop).toBeChecked();

      await app.page.getByRole("button", { name: "Send a test notification" }).click();

      await expect(app.page.getByText("Test notification sent")).toBeVisible();
      expect(sent(file)).toHaveLength(1);
      expect(sent(file)[0]).toMatch(/^Arden Code\tThis is a test notification/);

      await desktop.click();
      await expect(desktop).not.toBeChecked();
      await app.page.getByRole("button", { name: "Send a test notification" }).click();

      await expect(app.page.getByText("Notifications are off, so none was shown.")).toBeVisible();
      await app.page.waitForTimeout(500);
      expect(sent(file)).toHaveLength(1);

      // The choice is saved, and Rust still honors it after a restart.
      await app.close();
    } finally {
      app.kill();
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("the choice survives a restart, and a notification is still not shown", async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "arden-e2e-notifications-"));
    const file = path.join(folder, "sent.txt");
    const data = path.join(folder, "data");
    const first = await launchApp({ dataDir: data, env: { [notificationsFile]: file } });
    try {
      await openNotifications(first.page);
      await first.page.getByRole("switch", { name: "Desktop notifications" }).click();
      await expect(
        first.page.getByRole("switch", { name: "Desktop notifications" }),
      ).not.toBeChecked();
      await first.close();

      const second = await launchApp({ dataDir: data, env: { [notificationsFile]: file } });
      try {
        await openNotifications(second.page);
        await expect(
          second.page.getByRole("switch", { name: "Desktop notifications" }),
        ).not.toBeChecked();
        await second.page.getByRole("button", { name: "Send a test notification" }).click();
        await expect(
          second.page.getByText("Notifications are off, so none was shown."),
        ).toBeVisible();
        expect(sent(file)).toHaveLength(0);
      } finally {
        second.kill();
      }
    } finally {
      first.kill();
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
