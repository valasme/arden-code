import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";
import { z } from "zod";

import { expect, launchApp, test } from "./fixtures";

const settingsFile = z.object({
  $schema: z.string(),
  version: z.number(),
  appearance: z.object({ theme: z.enum(["system", "light", "dark"]) }),
});

const configFolder = (dataDir: string) => path.join(dataDir, "config");
const settingsPath = (dataDir: string) => path.join(configFolder(dataDir), "settings.json");

function readSettings(dataDir: string) {
  return settingsFile.parse(JSON.parse(readFileSync(settingsPath(dataDir), "utf8")));
}

function newDataDir() {
  return mkdtempSync(path.join(tmpdir(), "arden-e2e-settings-"));
}

function writeSettings(dataDir: string, text: string) {
  mkdirSync(configFolder(dataDir), { recursive: true });
  writeFileSync(settingsPath(dataDir), text);
}

const invalidCopies = (dataDir: string) =>
  existsSync(configFolder(dataDir))
    ? readdirSync(configFolder(dataDir)).filter((name) => name.startsWith("settings.invalid-"))
    : [];

async function openAppearance(page: Page) {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Appearance" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Appearance" })).toBeVisible();
}

test.describe("settings in the real app", () => {
  test("creates the settings file and its schema on the first launch", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();

      // The defaults from the plan (section 6.3), written out here as an independent check.
      expect(JSON.parse(readFileSync(settingsPath(app.dataDir), "utf8"))).toEqual({
        $schema: "./settings.schema.json",
        version: 1,
        general: { onStartup: "restore", checkForUpdates: true, regionalFormat: "windows" },
        appearance: {
          theme: "system",
          zoom: 100,
          followTextSize: true,
          codeFontSize: 13,
          codeLigatures: false,
          reduceMotion: "system",
          showStatusBar: true,
        },
        layout: { sidebarWidth: 260, inspectorWidth: 320 },
        notifications: { desktop: true },
        keyboard: { shortcuts: {} },
        advanced: {
          developerMode: false,
          nativeTitleBar: false,
          hardwareAcceleration: true,
          logLevel: "info",
        },
      });
      const schema = z
        .object({ type: z.literal("object") })
        .parse(
          JSON.parse(
            readFileSync(path.join(configFolder(app.dataDir), "settings.schema.json"), "utf8"),
          ),
        );
      expect(schema.type).toBe("object");
    } finally {
      app.kill();
    }
  });

  test("applies the theme at once and still has it after a restart", async () => {
    const dataDir = newDataDir();
    try {
      const first = await launchApp({ dataDir });
      await openAppearance(first.page);

      await first.page.getByRole("radio", { name: "Dark" }).click();

      await expect(first.page.locator("html")).toHaveClass(/dark/);
      await expect.poll(() => readSettings(dataDir).appearance.theme).toBe("dark");
      await first.close();

      const second = await launchApp({ dataDir });
      try {
        await expect(second.page.getByRole("main")).toBeVisible();
        await expect(second.page.locator("html")).toHaveClass(/dark/);
        await openAppearance(second.page);
        await expect(second.page.getByRole("radio", { name: "Dark" })).toBeChecked();

        await second.page.getByRole("radio", { name: "Light" }).click();
        await expect(second.page.locator("html")).toHaveClass(/light/);
        await expect(second.page.locator("html")).not.toHaveClass(/dark/);
      } finally {
        second.kill();
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("picks up a hand edit of the file while the app runs", async () => {
    const app = await launchApp();
    try {
      await openAppearance(app.page);
      const before = readFileSync(settingsPath(app.dataDir), "utf8");

      writeFileSync(
        settingsPath(app.dataDir),
        before.replace('"theme": "system"', '"theme": "dark"'),
      );

      await expect(app.page.locator("html")).toHaveClass(/dark/);
      await expect(app.page.getByRole("radio", { name: "Dark" })).toBeChecked();
    } finally {
      app.kill();
    }
  });

  test("falls back to the defaults with a quiet notice when the file is broken at startup", async () => {
    const dataDir = newDataDir();
    try {
      writeSettings(dataDir, '{ "appearance": { "theme": ');

      const app = await launchApp({ dataDir });
      try {
        await expect(app.page.getByText(/ARD-SET-002/)).toBeVisible();
        expect(invalidCopies(dataDir)).toHaveLength(1);
        // The broken text is kept, untouched, for the person to fix.
        const kept = invalidCopies(dataDir)[0] ?? "";
        expect(readFileSync(path.join(configFolder(dataDir), kept), "utf8")).toBe(
          '{ "appearance": { "theme": ',
        );
        expect(readSettings(dataDir).appearance.theme).toBe("system");
      } finally {
        app.kill();
      }
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("falls back the same way when the file breaks while the app runs", async () => {
    const app = await launchApp();
    try {
      await openAppearance(app.page);
      await app.page.getByRole("radio", { name: "Dark" }).click();
      await expect(app.page.locator("html")).toHaveClass(/dark/);
      // The page shows a change before Rust has saved it. Break the file only once the save is in,
      // or the save would land on top of the broken file and replace it.
      await expect.poll(() => readSettings(app.dataDir).appearance.theme).toBe("dark");

      writeFileSync(settingsPath(app.dataDir), '{"appearance":{"theme":"purple"}}');

      await expect(app.page.getByText(/ARD-SET-002/)).toBeVisible();
      await expect(
        app.page
          .getByRole("radiogroup", { name: "Theme" })
          .getByRole("radio", { name: "Same as Windows" }),
      ).toBeChecked();
      expect(invalidCopies(app.dataDir)).toHaveLength(1);
    } finally {
      app.kill();
    }
  });
});
