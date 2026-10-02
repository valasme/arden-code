import { type Locator, type Page, chromium } from "@playwright/test";

import { type RunningApp, expect, launchApp, test } from "./fixtures";
import { clickAt } from "./windows";

const sessionView = (page: Page) =>
  page.getByRole("heading", { level: 1, name: "What should the Demo agent work on?" });
const generalSettings = (page: Page) => page.getByRole("heading", { level: 1, name: "General" });

/** Sends a click of a mouse side button, the way Windows reports one. */
async function clickSideButton(page: Page, button: "back" | "forward") {
  const session = await page.context().newCDPSession(page);
  const details = { x: 400, y: 400, button, buttons: button === "back" ? 8 : 16, clickCount: 1 };
  await session.send("Input.dispatchMouseEvent", { type: "mousePressed", ...details });
  await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...details, buttons: 0 });
}

/**
 * Clicks a control with a real mouse click, through Windows. Playwright lets go of the page for the
 * click: while it is attached, clicks reach the page with other timing, and the toggles for the
 * sidebar and the inspector once worked in every test but never for a person. Returns the page,
 * attached again.
 */
async function clickForReal(app: RunningApp, page: Page, control: Locator): Promise<Page> {
  const box = await control.boundingBox();
  if (!box) throw new Error("the control is not on the page");
  const scale = await page.evaluate(() => devicePixelRatio);
  await page.context().browser()?.close();
  const center = { x: (box.x + box.width / 2) * scale, y: (box.y + box.height / 2) * scale };
  expect(clickAt(app.pid, center.x, center.y), "the app's window was not in front").toBe(true);
  // Long enough for the page to handle the click before Playwright attaches again.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${app.debugPort}`);
  const attached = browser.contexts()[0]?.pages()[0];
  if (!attached) throw new Error("the app has no page to attach to again");
  return attached;
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

  test("shows the inspector, hides the sidebar and hides the status bar with the title bar's toggles", async ({
    appPage,
  }) => {
    await expect(sessionView(appPage)).toBeVisible();
    const toggle = (name: string) => appPage.getByRole("button", { name, exact: true });

    await toggle("Inspector").click();
    await expect(appPage.getByRole("complementary", { name: "Inspector" })).toBeVisible();

    await toggle("Sidebar").click();
    await expect(appPage.getByRole("complementary", { name: "Sidebar" })).toBeHidden();

    await toggle("Status bar").click();
    await expect(appPage.getByRole("contentinfo")).toBeHidden();
    await toggle("Status bar").click();
    await expect(appPage.getByRole("contentinfo")).toBeVisible();
  });

  test("hides and shows the sidebar and the inspector with real clicks on the title bar's toggles", async () => {
    const app = await launchApp();
    try {
      let page = app.page;
      await expect(sessionView(page)).toBeVisible();
      const region = (name: string) => page.getByRole("complementary", { name });
      const toggle = (name: string) => page.getByRole("button", { name, exact: true });

      page = await clickForReal(app, page, toggle("Sidebar"));
      await expect(region("Sidebar")).toBeHidden();

      page = await clickForReal(app, page, toggle("Sidebar"));
      await expect(region("Sidebar")).toBeVisible();

      page = await clickForReal(app, page, toggle("Inspector"));
      await expect(region("Inspector")).toBeVisible();

      page = await clickForReal(app, page, toggle("Inspector"));
      await expect(region("Inspector")).toBeHidden();
    } finally {
      app.kill();
    }
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
