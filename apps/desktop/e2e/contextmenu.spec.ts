import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

async function openSettingsSearch(page: Page) {
  await page.getByRole("link", { name: "Settings" }).click();
  const search = page.getByRole("searchbox", { name: "Search settings" });
  await expect(search).toBeVisible();
  return search;
}

test.describe("context menus and area navigation in the real app", () => {
  test("a right click in a text field offers cut, copy, paste and select all, through the real clipboard", async ({
    appPage,
  }) => {
    const search = await openSettingsSearch(appPage);
    await search.fill("clipboard round trip");

    await search.click({ button: "right" });
    await expect(appPage.getByRole("menu")).toBeVisible();
    await appPage.getByRole("menuitem", { name: "Select all" }).click();
    await search.click({ button: "right" });
    await appPage.getByRole("menuitem", { name: "Cut" }).click();
    await expect(search).toHaveValue("");

    await search.click({ button: "right" });
    await appPage.getByRole("menuitem", { name: "Paste" }).click();

    await expect(search).toHaveValue("clipboard round trip");
  });

  test("Shift+F10 opens the same menu from the keyboard, and Esc gives the focus back", async ({
    appPage,
  }) => {
    const search = await openSettingsSearch(appPage);
    await search.fill("abc");
    await search.focus();

    await appPage.keyboard.press("Shift+F10");

    const menu = appPage.getByRole("menu");
    await expect(menu).toBeVisible();
    // Nothing is selected, so Cut and Copy are off and the menu starts on Paste.
    await expect(appPage.getByRole("menuitem", { name: "Paste" })).toBeFocused();
    await appPage.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(search).toBeFocused();
  });

  test("the Menu key opens it too", async ({ appPage }) => {
    const search = await openSettingsSearch(appPage);
    await search.focus();

    await appPage.keyboard.press("ContextMenu");

    await expect(appPage.getByRole("menu")).toBeVisible();
  });

  test("F6 and Shift+F6 move the focus between the areas of the window", async ({ appPage }) => {
    await expect(appPage.getByRole("main")).toBeVisible();
    const area = () =>
      appPage.evaluate(
        () => document.activeElement?.closest("[data-area]")?.getAttribute("data-area") ?? "none",
      );

    await appPage.keyboard.press("F6");
    expect(await area()).toBe("titlebar");
    await appPage.keyboard.press("F6");
    expect(await area()).toBe("sidebar");
    await appPage.keyboard.press("F6");
    expect(await area()).toBe("session");
    await appPage.keyboard.press("F6");
    expect(await area()).toBe("statusbar");
    await appPage.keyboard.press("Shift+F6");
    expect(await area()).toBe("session");
  });
});
