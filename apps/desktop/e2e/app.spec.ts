import { execFileSync } from "node:child_process";

import { expect, test } from "./fixtures";

/** The title of the app's main window, which Windows only reports while the window is visible. */
function visibleWindowTitle(): string {
  return execFileSync(
    "powershell",
    ["-NoProfile", "-Command", "(Get-Process arden-code | Select-Object -First 1).MainWindowTitle"],
    { encoding: "utf8" },
  ).trim();
}

test("the real app shows the welcome state", async ({ appPage }) => {
  await expect(appPage).toHaveTitle("Arden Code");
  await expect(appPage.getByRole("heading", { level: 1 })).toHaveText(
    "Real agents are coming. Try the Demo agent.",
  );
});

test("the About page shows the version and build that Rust reports", async ({ appPage }) => {
  await appPage.getByRole("link", { name: "Settings" }).click();
  await appPage.getByRole("link", { name: "About", exact: true }).click();

  const facts = appPage.locator("dd");
  await expect(facts.first()).toHaveText(/^\d+\.\d+\.\d+$/);
  await expect(facts.nth(1)).toHaveText(/^[0-9a-f]{12} \(\d{4}-\d{2}-\d{2}\)$/);
});

test("the window is shown once the UI has drawn its first frame", async ({ appPage }) => {
  await expect(appPage.getByRole("heading", { level: 1 })).toBeVisible();

  await expect.poll(visibleWindowTitle, { timeout: 4000 }).toBe("Arden Code");
});

test("the page uses the same theme as Windows", async ({ appPage }) => {
  await expect(appPage.getByRole("heading", { level: 1 })).toBeVisible();
  const theme = await appPage.evaluate(() => ({
    windowsIsDark: matchMedia("(prefers-color-scheme: dark)").matches,
    pageIsDark: document.documentElement.classList.contains("dark"),
    pageIsLight: document.documentElement.classList.contains("light"),
  }));

  expect(theme.pageIsDark).toBe(theme.windowsIsDark);
  expect(theme.pageIsLight).toBe(!theme.windowsIsDark);
});

test("fonts and everything else load from the app, never the network", async ({ appPage }) => {
  await expect(appPage.getByRole("heading", { level: 1 })).toBeVisible();
  const loaded = await appPage.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((font) => font.status === "loaded")
      .map((font) => font.family);
  });
  const hosts = await appPage.evaluate(() => [
    ...new Set(
      performance.getEntriesByType("resource").map((entry) => new URL(entry.name).hostname),
    ),
  ]);

  expect(loaded.some((family) => family.includes("Inter"))).toBe(true);
  // Tauri serves the app, its IPC bridge and the isolation frame from *.localhost hosts.
  expect(hosts.every((host) => host === "localhost" || host.endsWith(".localhost"))).toBe(true);
});
