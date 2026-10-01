import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";
import { z } from "zod";

import { expect, launchApp, test } from "./fixtures";

const settingsFile = z.object({
  general: z.object({ onStartup: z.string(), checkForUpdates: z.boolean() }),
  appearance: z.object({
    zoom: z.number(),
    showStatusBar: z.boolean(),
    codeFontSize: z.number(),
  }),
  layout: z.object({ sidebarWidth: z.number(), inspectorWidth: z.number() }),
});

const readSettings = (dataDir: string) =>
  settingsFile.parse(
    JSON.parse(readFileSync(path.join(dataDir, "config", "settings.json"), "utf8")),
  );

const rootFontSize = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).fontSize);

const sidebarWidth = (page: Page) =>
  page
    .getByRole("complementary", { name: "Sidebar" })
    .evaluate((element) => element.getBoundingClientRect().width);

async function openSettings(page: Page, tab: string) {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: tab, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: tab })).toBeVisible();
}

function withDataDir(run: (dataDir: string) => Promise<void>) {
  return async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "arden-e2e-appearance-"));
    try {
      await run(dataDir);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

test.describe("appearance and general settings in the real app", () => {
  test(
    "Ctrl+= zooms the whole window, is saved, and is still there after a restart",
    withDataDir(async (dataDir) => {
      const first = await launchApp({ dataDir });
      await expect(first.page.getByRole("main")).toBeVisible();
      expect(await rootFontSize(first.page)).toBe("16px");

      await first.page.keyboard.press("Control+=");

      await expect.poll(() => rootFontSize(first.page)).toBe("17.6px");
      await expect.poll(() => readSettings(dataDir).appearance.zoom).toBe(110);
      await first.close();

      const second = await launchApp({ dataDir });
      try {
        await expect(second.page.getByRole("main")).toBeVisible();
        expect(await rootFontSize(second.page)).toBe("17.6px");

        await second.page.keyboard.press("Control+0");

        await expect.poll(() => rootFontSize(second.page)).toBe("16px");
        await expect.poll(() => readSettings(dataDir).appearance.zoom).toBe(100);
      } finally {
        second.kill();
      }
    }),
  );

  test(
    "a sidebar dragged wider stays that wide after a restart",
    withDataDir(async (dataDir) => {
      const first = await launchApp({ dataDir });
      await expect(first.page.getByRole("main")).toBeVisible();
      const handle = first.page.getByRole("separator").first();
      const box = await handle.boundingBox();
      if (!box) throw new Error("the resize handle has no box");
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      await first.page.mouse.move(start.x, start.y);
      await first.page.mouse.down();
      await first.page.mouse.move(start.x + 60, start.y, { steps: 6 });
      await first.page.mouse.up();

      await expect.poll(() => readSettings(dataDir).layout.sidebarWidth).toBeGreaterThan(300);
      const saved = readSettings(dataDir).layout.sidebarWidth;
      await first.close();

      const second = await launchApp({ dataDir });
      try {
        await expect(second.page.getByRole("main")).toBeVisible();
        await expect.poll(() => sidebarWidth(second.page)).toBeCloseTo(saved, 0);
      } finally {
        second.kill();
      }
    }),
  );

  test(
    "changes in General are saved, and a reset puts one back",
    withDataDir(async (dataDir) => {
      const app = await launchApp({ dataDir });
      try {
        await openSettings(app.page, "General");

        await app.page.getByRole("radio", { name: "Start fresh" }).click();
        await app.page.getByRole("switch", { name: "Check for updates automatically" }).click();

        await expect
          .poll(() => readSettings(dataDir).general)
          .toEqual({
            onStartup: "fresh",
            checkForUpdates: false,
          });

        await app.page.getByRole("button", { name: "Reset On startup to its default" }).click();

        await expect
          .poll(() => readSettings(dataDir).general)
          .toEqual({
            onStartup: "restore",
            checkForUpdates: false,
          });
        await expect(
          app.page.getByRole("radio", { name: "Restore the last session" }),
        ).toBeFocused();
      } finally {
        app.kill();
      }
    }),
  );

  test(
    "the status bar can be hidden, and stays hidden after a restart",
    withDataDir(async (dataDir) => {
      const first = await launchApp({ dataDir });
      await openSettings(first.page, "Appearance");
      await expect(first.page.getByRole("contentinfo")).toBeVisible();

      await first.page.getByRole("switch", { name: "Show status bar" }).click();

      await expect(first.page.getByRole("contentinfo")).toBeHidden();
      await expect.poll(() => readSettings(dataDir).appearance.showStatusBar).toBe(false);
      await first.close();

      const second = await launchApp({ dataDir });
      try {
        await expect(second.page.getByRole("main")).toBeVisible();
        await expect(second.page.getByRole("contentinfo")).toBeHidden();
      } finally {
        second.kill();
      }
    }),
  );

  test(
    "searching finds a setting from another tab and changes it",
    withDataDir(async (dataDir) => {
      const app = await launchApp({ dataDir });
      try {
        await openSettings(app.page, "General");

        await app.page.getByRole("searchbox", { name: "Search settings" }).fill("code font");
        const slider = app.page.getByRole("slider", { name: "Code font size" });
        await slider.focus();
        await app.page.keyboard.press("ArrowRight");

        await expect.poll(() => readSettings(dataDir).appearance.codeFontSize).toBe(14);
      } finally {
        app.kill();
      }
    }),
  );
});
