import { expect, launchApp, test } from "./fixtures";
import { getWindow, virtualScreen } from "./windows";

test.describe("commands and shortcuts in the real app", () => {
  test("Ctrl+K opens the command palette, and Enter runs the command that was searched for", async ({
    appPage,
  }) => {
    await expect(appPage.getByRole("main")).toBeVisible();

    await appPage.keyboard.press("Control+k");
    const palette = appPage.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await appPage.keyboard.type("settings");
    await appPage.keyboard.press("Enter");

    await expect(appPage.getByRole("heading", { level: 1, name: "General" })).toBeVisible();
    await expect(palette).toBeHidden();
  });

  test("Ctrl+Shift+P opens it too", async ({ appPage }) => {
    await expect(appPage.getByRole("main")).toBeVisible();

    await appPage.keyboard.press("Control+Shift+P");

    await expect(appPage.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });

  test("the shortcuts for the sidebar, the inspector and the settings work", async ({
    appPage,
  }) => {
    await expect(appPage.getByRole("main")).toBeVisible();

    await appPage.keyboard.press("Control+b");
    await expect(appPage.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
    await appPage.keyboard.press("Control+b");
    await expect(appPage.getByRole("complementary", { name: "Sidebar" })).toBeVisible();

    await appPage.keyboard.press("Control+j");
    await expect(appPage.getByRole("complementary", { name: "Inspector" })).toBeVisible();

    await appPage.keyboard.press("Control+,");
    await expect(appPage.getByRole("heading", { level: 1, name: "General" })).toBeVisible();
  });

  test("Ctrl+/ shows every shortcut", async ({ appPage }) => {
    await expect(appPage.getByRole("main")).toBeVisible();

    await appPage.keyboard.press("Control+/");

    const sheet = appPage.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(sheet).toBeVisible();
    const text = (await sheet.textContent()) ?? "";
    for (const shortcut of [
      "Ctrl+K",
      "Ctrl+Shift+P",
      "Ctrl+,",
      "Ctrl+B",
      "Ctrl+J",
      "F11",
      "Alt+←",
      "Alt+→",
    ]) {
      expect(text, shortcut).toContain(shortcut);
    }
  });

  test("a shortcut works from the key's position on a non-Latin layout", async ({ appPage }) => {
    await expect(appPage.getByRole("main")).toBeVisible();

    // A Russian layout types "и" from the key at the Latin B position.
    await appPage.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "и",
          code: "KeyB",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    await expect(appPage.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
  });

  test("hovering a button shows its shortcut", async ({ appPage }) => {
    await expect(appPage.getByRole("main")).toBeVisible();

    await appPage.getByRole("button", { name: "Hide sidebar" }).hover();

    await expect(appPage.getByRole("tooltip")).toContainText("Ctrl+B");
  });

  test("F11 makes the real window fill the screen, and F11 again brings it back", async () => {
    const app = await launchApp();
    try {
      await expect.poll(() => getWindow(app.pid), { timeout: 15_000 }).toBeDefined();
      const before = getWindow(app.pid);

      await app.page.keyboard.press("F11");

      const screen = virtualScreen();
      await expect
        .poll(() => {
          const window = getWindow(app.pid);
          return (
            window !== undefined && window.width >= screen.width && window.height >= screen.height
          );
        })
        .toBe(true);

      await app.page.keyboard.press("F11");
      // Back to the size it had. (On a small screen that may be as large as the screen, so the size
      // is compared with the window's own, not with the screen's.)
      await expect
        .poll(() => {
          const window = getWindow(app.pid);
          return (
            window !== undefined &&
            before !== undefined &&
            Math.abs(window.width - before.width) <= 2 &&
            Math.abs(window.height - before.height) <= 2
          );
        })
        .toBe(true);
    } finally {
      app.kill();
    }
  });
});
