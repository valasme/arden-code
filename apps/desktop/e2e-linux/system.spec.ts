import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { executable, launchApp, until } from "./fixtures";

test.describe("the system on Linux", () => {
  test("the app is the terminal command: it prints its version, and opens a folder in the running window", async () => {
    const version = execFileSync(executable, ["--version"], { encoding: "utf8" });
    expect(version.trim()).toMatch(/^arden-code \d+\.\d+\.\d+/);

    const app = await launchApp();
    const parent = mkdtempSync(path.join(tmpdir(), "arden-e2e-project-"));
    const project = path.join(parent, "linux-project");
    try {
      execFileSync("mkdir", [project]);
      await until(
        async () => (await app.session.find('[data-area="titlebar"]')) !== undefined,
        "the page",
      );

      // The command starts the app apart from the terminal; the running copy gets the folder.
      execFileSync(executable, [project], { env: app.env, cwd: parent });

      await until(
        () => app.session.run<boolean>(`return document.body.innerText.includes("linux-project");`),
        "the folder as a project in the sidebar",
      );
    } finally {
      await app.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("the regional format is the locale the session gave the app", async () => {
    const app = await launchApp({
      env: { LC_ALL: "", LC_TIME: "en_GB.UTF-8", LANG: "en_US.UTF-8" },
    });
    try {
      await until(
        async () => (await app.session.find('[data-area="titlebar"]')) !== undefined,
        "the page",
      );

      const preferences = await app.session.runAsync<{ locale: string; textScalePercent: number }>(
        `const done = arguments[arguments.length - 1];
         window.__TAURI_INTERNALS__.invoke("get_system_preferences").then(done, (error) => done(String(error)));`,
      );

      expect(preferences.locale).toBe("en-GB");
      expect(preferences.textScalePercent).toBeGreaterThanOrEqual(100);
    } finally {
      await app.close();
    }
  });
});
