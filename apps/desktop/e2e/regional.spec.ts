import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";

import { expect, launchApp, test } from "./fixtures";

/** The debug build reads this file instead of Windows' own settings. */
const standIn = "ARDEN_CODE_SYSTEM_PREFERENCES_FILE";

function withStandIn(
  preferences: { textScalePercent: number; locale: string },
  run: (file: string, env: Record<string, string>) => Promise<void>,
) {
  return async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "arden-e2e-system-"));
    const file = path.join(folder, "system.json");
    writeFileSync(file, JSON.stringify(preferences));
    try {
      await run(file, { [standIn]: file });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  };
}

const rootFontSize = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).fontSize);

async function openSettings(page: Page, tab: string) {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: tab, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: tab })).toBeVisible();
}

test.describe("following Windows in the real app", () => {
  test(
    "writes dates and numbers in the Windows regional format, and English (US) can override it",
    withStandIn({ textScalePercent: 100, locale: "el-GR" }, async (_file, env) => {
      const app = await launchApp({ env });
      try {
        await openSettings(app.page, "General");

        // A Greek regional format, although the interface is in English.
        await expect(
          app.page.getByText("Example: 30/9/2026, 1.234.567,89, πριν από 5 λεπτά"),
        ).toBeVisible();

        await app.page.getByRole("radio", { name: "English (US)" }).click();

        await expect(
          app.page.getByText("Example: 9/30/2026, 1,234,567.89, 5 minutes ago"),
        ).toBeVisible();
      } finally {
        app.kill();
      }
    }),
  );

  test(
    "follows a change of the regional format made in Windows while the app runs",
    withStandIn({ textScalePercent: 100, locale: "de-DE" }, async (file, env) => {
      const app = await launchApp({ env });
      try {
        await openSettings(app.page, "General");
        await expect(app.page.getByText(/^Example: 30\.9\.2026/)).toBeVisible();

        writeFileSync(file, JSON.stringify({ textScalePercent: 100, locale: "en-GB" }));

        await expect(app.page.getByText(/^Example: 30\/09\/2026/)).toBeVisible({ timeout: 10_000 });
      } finally {
        app.kill();
      }
    }),
  );

  test(
    "scales the window with the Windows text size, live, unless told not to",
    withStandIn({ textScalePercent: 125, locale: "en-US" }, async (file, env) => {
      const app = await launchApp({ env });
      try {
        await expect(app.page.getByRole("main")).toBeVisible();
        expect(await rootFontSize(app.page)).toBe("20px");

        writeFileSync(file, JSON.stringify({ textScalePercent: 150, locale: "en-US" }));

        await expect.poll(() => rootFontSize(app.page), { timeout: 10_000 }).toBe("24px");

        await openSettings(app.page, "Appearance");
        await app.page.getByRole("switch", { name: "Follow Windows text size" }).click();

        await expect.poll(() => rootFontSize(app.page)).toBe("16px");
        expect(JSON.parse(readFileSync(file, "utf8")).textScalePercent).toBe(150);
      } finally {
        app.kill();
      }
    }),
  );
});
