import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const sessionView = (page: Page) =>
  page.getByRole("heading", { level: 1, name: "Real agents are coming. Try the Demo agent." });
const generalSettings = (page: Page) => page.getByRole("heading", { level: 1, name: "General" });

/** Sends a click of a mouse side button, the way Windows reports one. */
async function clickSideButton(page: Page, button: "back" | "forward") {
  const session = await page.context().newCDPSession(page);
  const details = { x: 400, y: 400, button, buttons: button === "back" ? 8 : 16, clickCount: 1 };
  await session.send("Input.dispatchMouseEvent", { type: "mousePressed", ...details });
  await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...details, buttons: 0 });
}

test.describe("layout and navigation in the real app", () => {
  test("shows the sidebar, the session view and the status bar, and hides the inspector", async ({
    appPage,
  }) => {
    await expect(sessionView(appPage)).toBeVisible();

    await expect(appPage.getByRole("complementary", { name: "Sidebar" })).toBeVisible();
    await expect(appPage.getByRole("main")).toBeVisible();
    await expect(appPage.getByRole("contentinfo")).toBeVisible();
    await expect(appPage.getByRole("complementary", { name: "Inspector" })).toBeHidden();
  });

  test("fills the window without a scrollbar on the page itself", async ({ appPage }) => {
    await expect(sessionView(appPage)).toBeVisible();

    // A page scrollbar takes width away from the document, so the two widths would differ.
    const scrollbar = await appPage.evaluate(() => ({
      width: window.innerWidth - document.documentElement.clientWidth,
      height: window.innerHeight - document.documentElement.clientHeight,
      overflow: getComputedStyle(document.body).overflow,
    }));

    expect(scrollbar).toEqual({ width: 0, height: 0, overflow: "hidden" });
  });

  test("shows the inspector and hides the sidebar with the status bar buttons", async ({
    appPage,
  }) => {
    await expect(sessionView(appPage)).toBeVisible();

    await appPage.getByRole("button", { name: "Show inspector" }).click();
    await expect(appPage.getByRole("complementary", { name: "Inspector" })).toBeVisible();

    await appPage.getByRole("button", { name: "Hide sidebar" }).click();
    await expect(appPage.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
  });

  test("goes back and forward with Alt+Left and Alt+Right", async ({ appPage }) => {
    await expect(sessionView(appPage)).toBeVisible();
    await appPage.getByRole("link", { name: "Settings" }).click();
    await expect(generalSettings(appPage)).toBeVisible();

    await appPage.keyboard.press("Alt+ArrowLeft");
    await expect(sessionView(appPage)).toBeVisible();

    await appPage.keyboard.press("Alt+ArrowRight");
    await expect(generalSettings(appPage)).toBeVisible();
  });

  test("goes back and forward with the mouse side buttons", async ({ appPage }) => {
    await expect(sessionView(appPage)).toBeVisible();
    await appPage.getByRole("link", { name: "Settings" }).click();
    await expect(generalSettings(appPage)).toBeVisible();

    await clickSideButton(appPage, "back");
    await expect(sessionView(appPage)).toBeVisible();

    await clickSideButton(appPage, "forward");
    await expect(generalSettings(appPage)).toBeVisible();
  });
});
