import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium, type Page } from "@playwright/test";

import { expect, launchApp, logText, openDevPage, test } from "./fixtures";
import { killWebViewRenderers } from "./windows";

/** The debug build takes the answer of the file dialog from here, so no dialog has to be clicked. */
const dialogAnswer = "ARDEN_CODE_FILE_DIALOG_ANSWER";

/** The names of the files in a zip, one per line. */
function zipEntries(zip: string): string {
  return execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Add-Type -AssemblyName System.IO.Compression.FileSystem;
       $zip = [IO.Compression.ZipFile]::OpenRead('${zip.replaceAll("'", "''")}');
       $zip.Entries | ForEach-Object { $_.FullName };
       $zip.Dispose()`,
    ],
    { encoding: "utf8" },
  );
}

/** A folder for a test's own files, removed afterwards. */
function withFolder(run: (folder: string) => Promise<void>) {
  return async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "arden-e2e-diagnostics-"));
    try {
      await run(folder);
    } finally {
      rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  };
}

async function openAdvanced(page: Page) {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Advanced", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Advanced" })).toBeVisible();
}

test.describe("diagnostics in the real app", () => {
  test("the log level can be raised to debug, and the log then says more", async () => {
    const app = await launchApp();
    try {
      await openAdvanced(app.page);
      await expect(app.page.getByRole("radio", { name: "Normal" })).toBeChecked();

      await app.page.getByRole("radio", { name: "Everything (debug)" }).click();
      await app.page.getByRole("switch", { name: "Developer mode" }).click();

      await expect
        .poll(() => logText(app.dataDir), { timeout: 15_000 })
        .toContain("settings changed");
    } finally {
      app.kill();
    }
  });

  test("the log viewer shows the log and filters it", async () => {
    const app = await launchApp();
    try {
      await openAdvanced(app.page);

      await app.page.getByRole("button", { name: "View logs" }).click();

      await expect(app.page.getByRole("heading", { level: 1, name: "Logs" })).toBeVisible();
      await expect(app.page.getByRole("row", { name: /Arden Code started/ })).toBeVisible();

      await app.page.getByLabel("Search the messages").fill("no such words anywhere");
      await expect(app.page.getByText("No entry matches.")).toBeVisible();

      await app.page.getByLabel("Search the messages").fill("started");
      await expect(app.page.getByRole("row", { name: /Arden Code started/ })).toBeVisible();

      await app.page.getByLabel("Level").selectOption("error");
      await expect(app.page.getByText("No entry matches.")).toBeVisible();
    } finally {
      app.kill();
    }
  });

  test(
    "exports a zip with the logs, the settings, system information and crash reports",
    withFolder(async (folder) => {
      const file = path.join(folder, "diagnostics.zip");
      const app = await launchApp({ env: { [dialogAnswer]: file } });
      try {
        await openDevPage(app, "/dev/errors");
        await app.page.getByRole("button", { name: "Panic on a Rust thread" }).click();
        await expect.poll(() => existsSync(path.join(app.dataDir, "local", "crashes"))).toBe(true);
        await openAdvanced(app.page);

        await app.page.getByRole("button", { name: "Export diagnostics" }).click();

        await expect(app.page.getByText(/^Diagnostics exported to /)).toBeVisible();
        const names = zipEntries(file);
        expect(names).toMatch(/system-info\.txt/);
        expect(names).toMatch(/settings\.json/);
        expect(names).toMatch(/logs\//);
        expect(names).toMatch(/crashes\//);
      } finally {
        app.kill();
      }
    }),
  );

  test(
    "offers to export diagnostics once after a crash",
    withFolder(async (folder) => {
      const first = await launchApp({ dataDir: folder });
      try {
        await openDevPage(first, "/dev/errors");
        await first.page.getByRole("button", { name: "Panic on a Rust thread" }).click();
        await expect.poll(() => existsSync(path.join(folder, "local", "crashes"))).toBe(true);
      } finally {
        first.kill();
      }

      const second = await launchApp({ dataDir: folder });
      try {
        const dialog = second.page.getByRole("alertdialog", {
          name: "Arden Code closed unexpectedly",
        });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Not now" }).click();
        await expect(dialog).toBeHidden();
      } finally {
        second.kill();
      }

      const third = await launchApp({ dataDir: folder });
      try {
        await expect(third.page.getByRole("main")).toBeVisible();
        await third.page.waitForTimeout(1000);
        await expect(third.page.getByRole("alertdialog")).toBeHidden();
      } finally {
        third.kill();
      }
    }),
  );

  test("a web engine that stops is started again, and the person is told", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();

      // Playwright cannot follow a page whose process is killed, so it lets go first.
      await app.page.context().browser()?.close();
      killWebViewRenderers(app.webViewProfile);

      await expect
        .poll(() => logText(app.dataDir), { timeout: 20_000 })
        .toContain("the web engine failed");
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${app.debugPort}`);
      try {
        const page = browser.contexts()[0]?.pages()[0];
        if (!page) throw new Error("the app has no page after the web engine restarted");
        await expect(page.getByText("Notice (ARD-WIN-002)")).toBeVisible({ timeout: 20_000 });
        await expect(page.getByRole("main")).toBeVisible();
      } finally {
        await browser.close().catch(() => {});
      }
      expect(app.process.exitCode).toBeNull();
    } finally {
      app.kill();
    }
  });
});
