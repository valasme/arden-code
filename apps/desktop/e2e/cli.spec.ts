import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { countAppProcesses } from "./windows";
import { executable, expect, launchApp, test } from "./fixtures";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
/** The terminal command from `pnpm build:debug`, which starts the debug build of the app. */
const command = path.join(repoRoot, "target", "debug", "arden-cli.exe");

function runCommand(args: string[], cwd?: string) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ARDEN_CODE_APP: executable },
    timeout: 30_000,
  });
}

test.describe("the arden-code terminal command", () => {
  let folder: string;

  test.beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), "arden-e2e-project-"));
    mkdirSync(path.join(folder, "my-project"));
  });

  test.afterEach(() => {
    rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  test("prints its version and help in the terminal", () => {
    expect(runCommand(["--version"]).stdout).toMatch(/^arden-code \d+\.\d+\.\d+/u);
    const help = runCommand(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("arden-code <FOLDER>");
  });

  test("refuses a folder that does not exist, and an option it does not know", () => {
    const missing = runCommand([path.join(folder, "nowhere")]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("does not exist");
    const unknown = runCommand(["--frobnicate"]);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("--help");
  });

  test("a folder given when the app starts becomes a project with a session open in it", async () => {
    const project = path.join(folder, "my-project");
    const app = await launchApp({ args: ["--open", project] });
    try {
      const sidebar = app.page.getByRole("complementary", { name: "Sidebar" });
      await expect(sidebar.getByRole("heading", { name: "my-project" })).toBeVisible();
      await expect(app.page.getByRole("textbox", { name: "Message" })).toBeVisible();
      // The heading says where the folder is, in case two projects have the same name.
      await expect(sidebar.getByRole("heading", { name: "my-project" })).toHaveAttribute(
        "title",
        /my-project$/u,
      );
    } finally {
      app.kill();
    }
  });

  test("the command hands a folder to the app that is already running, and opens no second one", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();
      const before = countAppProcesses();

      // From inside the folder, with a relative name, as a person would type it.
      const started = runCommand(["."], path.join(folder, "my-project"));

      expect(started.status).toBe(0);
      const sidebar = app.page.getByRole("complementary", { name: "Sidebar" });
      await expect(sidebar.getByRole("heading", { name: "my-project" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(app.page.getByRole("textbox", { name: "Message" })).toBeVisible();
      await app.page.waitForTimeout(1000);
      expect(countAppProcesses()).toBe(before);
    } finally {
      app.kill();
    }
  });

  test("opening the same folder again does not add a second project", async () => {
    const app = await launchApp();
    try {
      const project = path.join(folder, "my-project");
      runCommand([project]);
      const sidebar = app.page.getByRole("complementary", { name: "Sidebar" });
      await expect(sidebar.getByRole("heading", { name: "my-project" })).toBeVisible({
        timeout: 20_000,
      });

      runCommand([project.toUpperCase()]);

      await expect(sidebar.getByRole("link", { name: "New session" })).toHaveCount(2, {
        timeout: 20_000,
      });
      await expect(sidebar.getByRole("heading", { name: "my-project" })).toHaveCount(1);
    } finally {
      app.kill();
    }
  });
});
