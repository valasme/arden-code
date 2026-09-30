import { expect, launchApp, test } from "./fixtures";
import { pressKey, virtualKeys } from "./windows";

// These need the release build, where the browser features are turned off. Run them with
// `pnpm test:e2e:release`. In a debug build the browser keeps its shortcuts and menu on purpose.
test.skip(process.env["ARDEN_E2E_RELEASE"] !== "1", "needs a release build");

test.describe("the release build behaves like an app, not like a browser", () => {
  test("F5 does not reload the page, although Windows sends it to the web engine", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();
      await app.page.evaluate(() => {
        Reflect.set(window, "notReloaded", true);
      });

      // A key press through the debugging port never reaches the web engine's shortcuts, so this
      // one is a real key press on the keyboard.
      expect(pressKey(app.pid, virtualKeys.f5), "the app's window was not in front").toBe(true);
      await app.page.waitForTimeout(2500);

      expect(await app.page.evaluate(() => Reflect.get(window, "notReloaded"))).toBe(true);
    } finally {
      app.kill();
    }
  });

  test("Ctrl+P, Ctrl+F and F12 open nothing that takes the focus away", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();

      for (const keys of ["Control+p", "Control+f", "F12", "Control+Shift+i", "Control+u"]) {
        // oxlint-disable-next-line no-await-in-loop -- the keys are pressed one after the other
        await app.page.keyboard.press(keys);
      }
      await app.page.waitForTimeout(1500);

      // The page still has the focus and nothing (print preview, find bar, dev tools) replaced it.
      expect(await app.page.evaluate(() => document.hasFocus())).toBe(true);
      await expect(app.page.getByRole("main")).toBeVisible();
    } finally {
      app.kill();
    }
  });

  test("the browser's own context menu is never left to open", async () => {
    const app = await launchApp();
    try {
      await expect(app.page.getByRole("main")).toBeVisible();
      await app.page.evaluate(() => {
        // This runs after the app's own handler, so it sees whether the menu was cancelled.
        window.addEventListener("contextmenu", (event) => {
          Reflect.set(window, "menuCancelled", event.defaultPrevented);
        });
      });

      await app.page.getByRole("main").click({ button: "right" });

      expect(await app.page.evaluate(() => Reflect.get(window, "menuCancelled"))).toBe(true);
    } finally {
      app.kill();
    }
  });
});
