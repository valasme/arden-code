import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";
import { z } from "zod";

import { expect, launchApp, test } from "./fixtures";

const logLine = z.object({
  timestamp: z.string(),
  level: z.string(),
  target: z.string(),
  fields: z.record(z.string(), z.unknown()),
});
type LogLine = z.infer<typeof logLine>;

/** Every line of every log file the app has written so far. */
function readLog(dataDir: string): LogLine[] {
  const folder = path.join(dataDir, "local", "logs");
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => name.endsWith(".jsonl"))
    .flatMap((name) => readFileSync(path.join(folder, name), "utf8").split("\n"))
    .filter((line) => line.trim() !== "")
    .map((line) => logLine.parse(JSON.parse(line)));
}

const crashReport = z.object({
  version: z.string(),
  message: z.string(),
  location: z.string(),
  backtrace: z.string(),
});

function readCrashReports(dataDir: string) {
  const folder = path.join(dataDir, "local", "crashes");
  if (!existsSync(folder)) return [];
  return readdirSync(folder).map((name) =>
    crashReport.parse(JSON.parse(readFileSync(path.join(folder, name), "utf8"))),
  );
}

const errorsPage = "http://tauri.localhost/dev/errors";

async function openErrorsPage(page: Page, search = "") {
  await page.goto(`${errorsPage}${search}`);
}

test.describe("errors and logs in the real app", () => {
  test("writes its start to a JSON log file", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();

      await expect
        .poll(() =>
          readLog(app.dataDir).some((line) => line.fields["message"] === "Arden Code started"),
        )
        .toBe(true);
      const start = readLog(app.dataDir).find(
        (line) => line.fields["message"] === "Arden Code started",
      );
      expect(start).toMatchObject({ level: "INFO" });
      expect(start?.timestamp).toMatch(/Z$/);
    } finally {
      app.kill();
    }
  });

  test("logs an error nobody handled with its code, and tells the user", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();

      await app.page.evaluate(() => {
        setTimeout(() => {
          throw new Error("boom for the test");
        });
      });

      await expect(app.page.getByText("Something went wrong (ARD-APP-002)")).toBeVisible();
      await expect
        .poll(() =>
          readLog(app.dataDir).find(
            (line) =>
              line.target === "ui" && String(line.fields["message"]).includes("boom for the test"),
          ),
        )
        .toMatchObject({ level: "ERROR", fields: { code: "ARD-APP-002", source: "ui" } });
    } finally {
      app.kill();
    }
  });

  test("keeps private details out of the log, whichever side wrote the line", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();

      await app.page.evaluate(() => {
        void Promise.reject(
          new Error(
            String.raw`failed for ada@example.com in C:\Users\Ada\notes.txt, token=abcdef123456`,
          ),
        );
      });

      await expect
        .poll(() =>
          readLog(app.dataDir).some((line) =>
            String(line.fields["message"]).includes("failed for"),
          ),
        )
        .toBe(true);
      const text = JSON.stringify(readLog(app.dataDir));
      expect(text).not.toContain("ada@example.com");
      expect(text).not.toContain("Ada");
      expect(text).not.toContain("abcdef123456");
      expect(text).toContain("[email]");
      expect(text).toContain("%USERPROFILE%");
      expect(text).toContain("[redacted]");
    } finally {
      app.kill();
    }
  });

  test("a failing page shows its error code and keeps the rest of the app working", async () => {
    const app = await launchApp();
    try {
      await openErrorsPage(app.page, "?fail=render");

      await expect(app.page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
      await expect(app.page.getByText("ARD-APP-002")).toBeVisible();
      await expect(app.page.getByRole("button", { name: "Copy details" })).toBeVisible();
      await expect(app.page.getByRole("button", { name: "Reload" })).toBeVisible();
      await expect(app.page.getByRole("button", { name: "Open logs" })).toBeVisible();
      await expect
        .poll(() =>
          readLog(app.dataDir).some(
            (line) =>
              line.fields["code"] === "ARD-APP-002" &&
              String(line.fields["message"]).startsWith("Error screen shown"),
          ),
        )
        .toBe(true);

      // The title bar and sidebar around the failed page still work.
      await app.page.getByRole("link", { name: "Settings" }).click();
      await expect(app.page.getByRole("heading", { level: 1, name: "General" })).toBeVisible();
    } finally {
      app.kill();
    }
  });

  test("a command that fails in Rust reaches the UI as a typed error with its code", async () => {
    const app = await launchApp();
    try {
      await openErrorsPage(app.page);

      await app.page.getByRole("button", { name: "Fail a command" }).click();

      await expect(app.page.getByText(/The command failed with ARD-APP-001/)).toBeVisible();
    } finally {
      app.kill();
    }
  });

  test("a panic in Rust leaves a crash report without private details", async () => {
    const app = await launchApp();
    try {
      await openErrorsPage(app.page);

      await app.page.getByRole("button", { name: "Panic on a Rust thread" }).click();

      await expect.poll(() => readCrashReports(app.dataDir).length).toBe(1);
      const [report] = readCrashReports(app.dataDir);
      expect(report?.message).toContain("deliberate panic for testing");
      expect(report?.location).toContain("diagnostics.rs");
      expect(report?.backtrace.length).toBeGreaterThan(0);
      expect(report?.version).toMatch(/^\d+\.\d+\.\d+$/);
      // A panic on a background thread does not take the app down.
      expect(app.process.exitCode).toBeNull();
    } finally {
      app.kill();
    }
  });
});
