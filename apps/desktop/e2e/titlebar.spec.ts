import type { Page } from "@playwright/test";

import { expect, launchApp, test } from "./fixtures";
import {
  bringForward,
  clientToScreen,
  getWindow,
  hitTest,
  isMenuOpen,
  narrowestWidth,
  openMenuRect,
  pressKeyInFront,
} from "./windows";

/** Windows' answer for a Maximize button, the one that brings up Snap Layouts. */
const maximizeButtonAnswer = 9;

/** The middle of one of the page's buttons, in the screen's pixels from the top left of the page. */
async function middleOf(page: Page, name: string) {
  const box = await page.getByRole("button", { name, exact: true }).boundingBox();
  if (!box) throw new Error(`the page has no ${name} button`);
  const scale = await page.evaluate(() => globalThis.devicePixelRatio);
  return { x: (box.x + box.width / 2) * scale, y: (box.y + box.height / 2) * scale };
}

test.describe("Snap Layouts on the title bar's Maximize button", () => {
  test("Windows finds a Maximize button exactly where the page draws one", async () => {
    const app = await launchApp();
    try {
      await expect.poll(() => getWindow(app.pid), { timeout: 15_000 }).toBeDefined();
      const maximize = await middleOf(app.page, "Maximize");
      const minimize = await middleOf(app.page, "Minimize");

      await expect
        .poll(() => hitTest(app.pid, maximize.x, maximize.y), { timeout: 10_000 })
        .toBe(maximizeButtonAnswer);
      expect(hitTest(app.pid, minimize.x, minimize.y)).not.toBe(maximizeButtonAnswer);
    } finally {
      app.kill();
    }
  });

  test("Windows is told the window can be as narrow as Snap Layouts' zones need", async () => {
    const app = await launchApp();
    try {
      await expect.poll(() => getWindow(app.pid), { timeout: 15_000 }).toBeDefined();
      const scale = await app.page.evaluate(() => globalThis.devicePixelRatio);

      // Windows asks for 500 px or less, or a window does not fit a zone of a layout.
      expect(Math.round(narrowestWidth(app.pid) / scale)).toBeLessThanOrEqual(500);
    } finally {
      app.kill();
    }
  });
});

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
      await app.page.locator("[data-area=titlebar]").dblclick({ position: { x: 200, y: 16 } });

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

  test("the Window menu button opens the menu under itself, not at the window's corner", async () => {
    const app = await launchApp();
    try {
      await expect.poll(() => getWindow(app.pid), { timeout: 15_000 }).toBeDefined();
      const button = app.page.getByRole("button", { name: "Window menu" });
      const box = await button.boundingBox();
      if (!box) throw new Error("the page has no Window menu button");
      const scale = await app.page.evaluate(() => globalThis.devicePixelRatio);
      const below = clientToScreen(app.pid, box.x * scale, (box.y + box.height) * scale);
      expect(bringForward(app.pid)).toBe(true);

      await button.click();

      await expect.poll(openMenuRect, { timeout: 5000 }).toBeDefined();
      const menu = openMenuRect();
      expect(Math.abs((menu?.x ?? 0) - below.x)).toBeLessThanOrEqual(2);
      expect(Math.abs((menu?.y ?? 0) - below.y)).toBeLessThanOrEqual(2);

      // Its commands still work: X is Maximize's access key.
      pressKeyInFront(0x58);
      await expect.poll(() => getWindow(app.pid)?.maximized, { timeout: 5000 }).toBe(true);
    } finally {
      app.kill();
    }
  });
});
