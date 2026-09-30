import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";
import { z } from "zod";

import { expect, launchApp, test } from "./fixtures";

const settingsFile = z.object({
  keyboard: z.object({ shortcuts: z.record(z.string(), z.array(z.string())) }),
});

const shortcutsInFile = (dataDir: string) =>
  settingsFile.parse(
    JSON.parse(readFileSync(path.join(dataDir, "config", "settings.json"), "utf8")),
  ).keyboard.shortcuts;

async function openKeyboard(page: Page) {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Keyboard", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Keyboard" })).toBeVisible();
}

const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette" });

test("a shortcut changed in the Keyboard tab works at once, and after a restart", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "arden-e2e-keyboard-"));
  try {
    const first = await launchApp({ dataDir });
    await openKeyboard(first.page);

    await first.page
      .getByRole("button", { name: "Change shortcut Ctrl+K for Command palette" })
      .click();
    await first.page.keyboard.press("Control+Shift+O");

    await expect
      .poll(() => shortcutsInFile(dataDir)["palette.open"])
      .toEqual(["Ctrl+Shift+O", "Ctrl+Shift+P"]);
    // The old shortcut no longer opens the palette; the new one does.
    await first.page.keyboard.press("Control+k");
    await expect(palette(first.page)).toBeHidden();
    await first.page.keyboard.press("Control+Shift+O");
    await expect(palette(first.page)).toBeVisible();
    await first.page.keyboard.press("Escape");
    await first.close();

    const second = await launchApp({ dataDir });
    try {
      await expect(second.page.getByRole("main")).toBeVisible();
      await second.page.keyboard.press("Control+Shift+O");
      await expect(palette(second.page)).toBeVisible();
    } finally {
      second.kill();
    }
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("a shortcut that another command has is flagged, and Reset all puts everything back", async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "arden-e2e-keyboard-"));
  try {
    const app = await launchApp({ dataDir });
    try {
      await openKeyboard(app.page);
      await app.page
        .getByRole("button", { name: "Change shortcut Ctrl+K for Command palette" })
        .click();

      await app.page.keyboard.press("Control+b");

      await expect(app.page.getByText("Ctrl+B is already used by Toggle sidebar.")).toBeVisible();
      // Recording took the key press, so it did not also hide the sidebar.
      await expect(app.page.getByRole("complementary", { name: "Sidebar" })).toBeVisible();
      await app.page.getByRole("button", { name: "Use it here instead" }).click();
      await expect.poll(() => shortcutsInFile(dataDir)["sidebar.toggle"]).toEqual([]);

      await app.page.getByRole("button", { name: "Reset all shortcuts" }).click();

      await expect.poll(() => shortcutsInFile(dataDir)).toEqual({});
      await app.page.keyboard.press("Control+b");
      await expect(app.page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
    } finally {
      app.kill();
    }
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
