import { expect, launchApp, test } from "./fixtures";
import { getWindow, isMenuOpen } from "./windows";

test.describe("the title bar in the real app", () => {
  test("its window buttons minimize, maximize and restore the real window", async () => {
    const app = await launchApp();
    try {
      await expect.poll(() => getWindow(app.pid), { timeout: 15_000 }).toBeDefined();
      const maximize = app.page.getByRole("button", { name: "Maximize" });

      await maximize.click();
      await expect.poll(() => getWindow(app.pid)?.maximized).toBe(true);
      // The button now offers the opposite action.
      await app.page.getByRole("button", { name: "Restore" }).click();
      await expect.poll(() => getWindow(app.pid)?.maximized).toBe(false);

      await app.page.getByRole("button", { name: "Minimize" }).click();
      await expect.poll(() => getWindow(app.pid)?.minimized).toBe(true);
    } finally {
      app.kill();
    }
  });

  test("its close button ends the app", async () => {
    const app = await launchApp();
    try {
      await expect.poll(() => getWindow(app.pid), { timeout: 15_000 }).toBeDefined();
      const exited = new Promise<void>((resolve) => app.process.once("exit", () => resolve()));

      await app.page.getByRole("button", { name: "Close" }).click();

      await Promise.race([
        exited,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("the app did not exit after Close")), 10_000),
        ),
      ]);
    } finally {
      app.kill();
    }
  });

  test("a double click on the empty bar maximizes the window", async () => {
    const app = await launchApp();
    try {
      await expect.poll(() => getWindow(app.pid), { timeout: 15_000 }).toBeDefined();

      // Between the Forward button and the search field there is only bare bar.
      await app.page.locator("header").dblclick({ position: { x: 200, y: 16 } });

      await expect.poll(() => getWindow(app.pid)?.maximized).toBe(true);
    } finally {
      app.kill();
    }
  });

  test("Alt+Space opens Windows' own system menu", async () => {
    const app = await launchApp();
    try {
      await expect.poll(() => getWindow(app.pid), { timeout: 15_000 }).toBeDefined();
      expect(isMenuOpen()).toBe(false);

      await app.page.keyboard.press("Alt+Space");

      await expect.poll(isMenuOpen, { timeout: 5000 }).toBe(true);
    } finally {
      app.kill();
    }
  });

  test("clicking the logo opens the same system menu", async () => {
    const app = await launchApp();
    try {
      await expect.poll(() => getWindow(app.pid), { timeout: 15_000 }).toBeDefined();

      await app.page.getByRole("button", { name: "Window menu" }).click();

      await expect.poll(isMenuOpen, { timeout: 5000 }).toBe(true);
    } finally {
      app.kill();
    }
  });
});
