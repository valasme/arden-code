import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";
import { z } from "zod";

import { expect, launchApp, logText, test } from "./fixtures";
import { countAppProcesses, frameHeight, killAllApps, webViewCommandLines } from "./windows";

const settingsFile = z.object({
  appearance: z.object({ zoom: z.number() }),
  advanced: z.object({
    developerMode: z.boolean(),
    nativeTitleBar: z.boolean(),
    hardwareAcceleration: z.boolean(),
  }),
});

const readSettings = (dataDir: string) =>
  settingsFile.parse(
    JSON.parse(readFileSync(path.join(dataDir, "config", "settings.json"), "utf8")),
  );

async function openAdvanced(page: Page) {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Advanced", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Advanced" })).toBeVisible();
}

/** A folder for a test's own files, removed afterwards. */
function withFolder(run: (folder: string) => Promise<void>) {
  return async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "arden-e2e-advanced-"));
    try {
      await run(folder);
    } finally {
      rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  };
}

/** The debug build takes the answer of the file dialog from here, so no dialog has to be clicked. */
const dialogAnswer = "ARDEN_CODE_FILE_DIALOG_ANSWER";

test.describe("Advanced settings in the real app", () => {
  test(
    "the Windows title bar replaces the app's own, and switching back brings it back",
    withFolder(async () => {
      const app = await launchApp();
      try {
        await expect.poll(() => frameHeight(app.pid), { timeout: 15_000 }).toBeLessThan(10);
        await openAdvanced(app.page);
        await expect(app.page.getByRole("button", { name: "Close" })).toBeVisible();

        await app.page.getByRole("switch", { name: "Use the Windows title bar" }).click();

        await expect.poll(() => frameHeight(app.pid)).toBeGreaterThan(25);
        await expect(app.page.getByRole("button", { name: "Close" })).toBeHidden();
        await expect(
          app.page.getByRole("button", { name: /^Search or run a command/ }),
        ).toBeVisible();

        await app.page.getByRole("switch", { name: "Use the Windows title bar" }).click();

        await expect.poll(() => frameHeight(app.pid)).toBeLessThan(10);
        await expect(app.page.getByRole("button", { name: "Close" })).toBeVisible();
      } finally {
        app.kill();
      }
    }),
  );

  test(
    "settings can be exported to a file and imported from it again",
    withFolder(async (folder) => {
      const file = path.join(folder, "backup.json");
      const app = await launchApp({ env: { [dialogAnswer]: file } });
      try {
        await openAdvanced(app.page);
        await app.page.keyboard.press("Control+=");
        await expect.poll(() => readSettings(app.dataDir).appearance.zoom).toBe(110);

        await app.page.getByRole("button", { name: "Export settings" }).click();
        await expect(app.page.getByText(/^Settings exported to /)).toBeVisible();
        expect(JSON.parse(readFileSync(file, "utf8")).appearance.zoom).toBe(110);

        // Change the exported file the way a person might, and bring it back in.
        const wanted = JSON.parse(readFileSync(file, "utf8"));
        wanted.appearance.zoom = 150;
        writeFileSync(file, JSON.stringify(wanted));
        await app.page.getByRole("button", { name: "Import settings" }).click();

        await expect(app.page.getByText("Settings imported")).toBeVisible();
        await expect.poll(() => readSettings(app.dataDir).appearance.zoom).toBe(150);
        await expect
          .poll(() => app.page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
          .toBe("24px");
      } finally {
        app.kill();
      }
    }),
  );

  test(
    "a file that is not settings is refused with its code, and nothing changes",
    withFolder(async (folder) => {
      const file = path.join(folder, "broken.json");
      writeFileSync(file, "this is not json");
      const app = await launchApp({ env: { [dialogAnswer]: file } });
      try {
        await openAdvanced(app.page);
        await app.page.keyboard.press("Control+=");
        await expect.poll(() => readSettings(app.dataDir).appearance.zoom).toBe(110);

        await app.page.getByRole("button", { name: "Import settings" }).click();

        await expect(app.page.getByText("Something went wrong (ARD-SET-003)")).toBeVisible();
        expect(readSettings(app.dataDir).appearance.zoom).toBe(110);
      } finally {
        app.kill();
      }
    }),
  );

  test(
    "Reset settings asks first, and then puts everything back",
    withFolder(async () => {
      const app = await launchApp();
      try {
        await openAdvanced(app.page);
        await app.page.keyboard.press("Control+=");
        await app.page.getByRole("switch", { name: "Developer mode" }).click();
        await expect.poll(() => readSettings(app.dataDir).advanced.developerMode).toBe(true);

        await app.page.getByRole("button", { name: "Reset settings" }).click();
        const question = app.page.getByRole("alertdialog", { name: "Reset all settings?" });
        await expect(question).toBeVisible();
        await question.getByRole("button", { name: "Cancel" }).click();
        expect(readSettings(app.dataDir).appearance.zoom).toBe(110);

        await app.page.getByRole("button", { name: "Reset settings" }).click();
        await question.getByRole("button", { name: "Reset settings" }).click();

        await expect.poll(() => readSettings(app.dataDir).appearance.zoom).toBe(100);
        expect(readSettings(app.dataDir).advanced.developerMode).toBe(false);
        await expect(app.page.getByRole("switch", { name: "Developer mode" })).not.toBeChecked();
      } finally {
        app.kill();
      }
    }),
  );

  test(
    "Reset Arden Code wipes its files, the web engine's too, and starts it again as new",
    withFolder(async () => {
      const app = await launchApp();
      try {
        // As on a real install, the engine keeps its files in the app's folder, and has them open
        // until a moment after the app has ended.
        const engineFolder = path.join(app.dataDir, "local", "EBWebView");
        expect(existsSync(engineFolder)).toBe(true);
        await openAdvanced(app.page);
        await app.page.keyboard.press("Control+=");
        await expect.poll(() => readSettings(app.dataDir).appearance.zoom).toBe(110);
        const oldFiles = [
          path.join(app.dataDir, "local", "logs", "left-over.txt"),
          path.join(engineFolder, "left-over.txt"),
        ];
        for (const file of oldFiles) {
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, "from before the reset");
        }

        await app.page.getByRole("button", { name: "Reset Arden Code" }).click();
        await app.page
          .getByRole("alertdialog", { name: "Reset Arden Code?" })
          .getByRole("button", { name: "Reset Arden Code" })
          .click();

        // The new start does the wiping, then writes fresh files.
        await expect
          .poll(
            () => {
              try {
                return (
                  oldFiles.every((file) => !existsSync(file)) &&
                  readSettings(app.dataDir).appearance.zoom === 100
                );
              } catch {
                // The new start has not written the settings yet.
                return false;
              }
            },
            { timeout: 30_000 },
          )
          .toBe(true);
        expect(existsSync(path.join(app.dataDir, "local", "reset-requested"))).toBe(false);
        expect(countAppProcesses(), "only the new start runs").toBe(1);
      } finally {
        killAllApps();
        app.kill();
      }
    }),
  );

  test(
    "turning hardware acceleration off takes effect after a restart",
    withFolder(async () => {
      const app = await launchApp();
      try {
        await openAdvanced(app.page);
        // A machine with no graphics card turns acceleration off by itself, so the web engine's own
        // command line cannot say what this setting did. What the app asked for is in its log.
        expect(logText(app.dataDir)).toContain("the web engine's arguments");
        expect(logText(app.dataDir)).not.toContain("--disable-gpu");

        await app.page.getByRole("switch", { name: "Hardware acceleration" }).click();
        const question = app.page.getByRole("alertdialog", { name: "Restart Arden Code?" });
        await expect(question).toBeVisible();
        await question.getByRole("button", { name: "Restart now" }).click();

        await expect
          .poll(
            () => webViewCommandLines(app.webViewProfile).join("\n").includes("--disable-gpu"),
            {
              timeout: 30_000,
            },
          )
          .toBe(true);
        expect(readSettings(app.dataDir).advanced.hardwareAcceleration).toBe(false);
        await expect
          .poll(() => logText(app.dataDir), { timeout: 30_000 })
          .toContain("--disable-gpu");
      } finally {
        killAllApps();
        app.kill();
      }
    }),
  );
});
