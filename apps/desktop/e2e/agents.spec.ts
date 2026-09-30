import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";

import { expect, launchApp, openDevPage, test } from "./fixtures";

/** A folder with a fake agent program in it, so detection does not depend on this computer. */
function fakeBin(files: Record<string, string> = {}) {
  const folder = mkdtempSync(path.join(tmpdir(), "arden-e2e-bin-"));
  for (const [name, content] of Object.entries(files))
    writeFileSync(path.join(folder, name), content);
  return folder;
}

/** The programs the app may find are these and Windows' own, and nothing else. */
const windowsPath = String.raw`C:\Windows\System32;C:\Windows`;

async function openAgents(page: Page) {
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Agents", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Agents" })).toBeVisible();
}

const isRunning = (pid: number) =>
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `@(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Count`],
    { encoding: "utf8" },
  ).trim() === "1";

test.describe("agents in the real app", () => {
  test("Settings → Agents shows what is installed, with its version and where, and looks again when asked", async () => {
    const bin = fakeBin({ "claude.cmd": "@echo off\r\necho 2.1.5 (Claude Code)\r\n" });
    const app = await launchApp({ env: { PATH: `${bin};${windowsPath}` } });
    try {
      await openAgents(app.page);

      const claude = app.page.getByRole("region", { name: "Claude Code" });
      await expect(claude.getByText("Installed")).toBeVisible();
      await expect(claude.getByText("2.1.5", { exact: true })).toBeVisible();
      await expect(claude.getByText(path.join(bin, "claude.cmd"))).toBeVisible();
      const codex = app.page.getByRole("region", { name: "Codex" });
      await expect(codex.getByText("Not installed")).toBeVisible();
      await expect(codex.getByRole("button", { name: "How to install Codex" })).toBeVisible();

      // The person installs Codex, and asks again.
      writeFileSync(path.join(bin, "codex.cmd"), "@echo off\r\necho codex-cli 0.46.0\r\n");
      await app.page.getByRole("button", { name: "Check again" }).click();

      await expect(codex.getByText("Installed")).toBeVisible();
      await expect(codex.getByText("0.46.0", { exact: true })).toBeVisible();
      // Each program that was asked for its version has a log of its own.
      const logs = readdirSync(path.join(app.dataDir, "local", "logs", "agents"));
      expect(logs.some((name) => name.startsWith("claude-version-"))).toBe(true);
      expect(logs.some((name) => name.startsWith("codex-version-"))).toBe(true);
      const claudeLog = logs.find((name) => name.startsWith("claude-version-")) ?? "";
      expect(
        readFileSync(path.join(app.dataDir, "local", "logs", "agents", claudeLog), "utf8"),
      ).toContain("2.1.5 (Claude Code)");
    } finally {
      app.kill();
      rmSync(bin, { recursive: true, force: true });
    }
  });

  test("says that nothing is installed when nothing is", async () => {
    const bin = fakeBin();
    const app = await launchApp({ env: { PATH: `${bin};${windowsPath}` } });
    try {
      await openAgents(app.page);

      await expect(
        app.page.getByRole("region", { name: "Claude Code" }).getByText("Not installed"),
      ).toBeVisible();
      await expect(
        app.page.getByRole("region", { name: "Codex" }).getByText("Not installed"),
      ).toBeVisible();
    } finally {
      app.kill();
      rmSync(bin, { recursive: true, force: true });
    }
  });

  test("a program the app started ends when the app is ended, however it is ended", async () => {
    const app = await launchApp();
    try {
      await openDevPage(app, "/dev/errors");
      await app.page
        .getByRole("button", { name: "Start a program that runs for two minutes" })
        .click();
      // What the page says, whether the program started or the command failed.
      const answer = app.page.getByText(/^(Started program \d+|The command failed with .*)$/);
      await expect(answer).toBeVisible({ timeout: 15_000 });
      const text = await answer.textContent();
      expect(text, "the program could not be started").toMatch(/^Started program \d+$/);
      const pid = Number(/\d+/.exec(text ?? "")?.[0]);
      expect(pid).toBeGreaterThan(0);
      expect(isRunning(pid)).toBe(true);
      // The program has a log of its own.
      const folder = path.join(app.dataDir, "local", "logs", "agents");
      expect(existsSync(folder)).toBe(true);
      expect(readdirSync(folder).some((name) => name.startsWith("sleeper-"))).toBe(true);

      // Ended from outside, as Task Manager would: no chance to tidy up.
      execFileSync("taskkill", ["/pid", String(app.pid), "/F"], { stdio: "ignore" });

      await expect.poll(() => isRunning(pid), { timeout: 15_000 }).toBe(false);
    } finally {
      app.kill();
    }
  });
});
