import { expect, test, type Page } from "@playwright/test";

const themes = [
  { name: "light", colorScheme: "light", forcedColors: "none" },
  { name: "dark", colorScheme: "dark", forcedColors: "none" },
  // Windows contrast themes report forced colors; dark is the more common high contrast palette.
  { name: "high-contrast", colorScheme: "dark", forcedColors: "active" },
] as const;

async function openDesignSystem(page: Page, search = "") {
  await page.goto(`/dev/design-system${search}`);
  await expect(page.getByRole("heading", { level: 1, name: "Design system" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // The code sample is colored when its grammar has loaded, a moment after the page.
  await expect(
    page.locator('[data-streamdown="code-block-body"] code span[style]').first(),
  ).toBeVisible();
}

for (const { name, colorScheme, forcedColors } of themes) {
  test(`the design system page looks right in ${name}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, forcedColors });
    await openDesignSystem(page);

    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  });
}

test("the design system page looks right at 200% zoom", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openDesignSystem(page, "?zoom=2");

  await expect(page).toHaveScreenshot("zoom-200.png", { fullPage: true });
});

test("the page follows the Windows theme live", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openDesignSystem(page);
  await expect(page.locator("html")).toHaveClass(/light/);

  await page.emulateMedia({ colorScheme: "dark" });

  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("an explicit theme choice overrides Windows", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openDesignSystem(page, "?theme=light");

  await expect(page.locator("html")).toHaveClass(/light/);
});

test("keyboard focus shows a 1px outline, and mouse clicks show none", async ({ page }) => {
  await openDesignSystem(page);
  const outline = (selector: string) =>
    page.locator(selector).evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset };
    });

  const button = page.getByRole("button", { name: "Default" }).first();

  // A mouse click focuses the button but must not draw a ring.
  await button.click();
  await expect(button).toBeFocused();
  expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");

  // Tabbing away and back shows the quiet keyboard ring.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(button).toBeFocused();
  const keyboardRing = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width: style.outlineWidth,
      style: style.outlineStyle,
      offset: style.outlineOffset,
      shadow: style.boxShadow,
    };
  });
  expect(keyboardRing).toEqual({ width: "1px", style: "solid", offset: "1px", shadow: "none" });
  expect(await outline("input")).toMatchObject({ style: "none" });
});

test("in a high contrast theme, borders and the focus outline stay visible", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active", colorScheme: "dark" });
  await openDesignSystem(page);

  const input = page.getByRole("textbox");
  await input.focus();
  await page.keyboard.press("Shift+Tab");
  await input.focus();

  const look = await input.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderWidth: style.borderTopWidth,
      borderStyle: style.borderTopStyle,
      borderColor: style.borderTopColor,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
    };
  });
  const canvas = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  expect(look.borderStyle).toBe("solid");
  expect(look.borderWidth).toBe("1px");
  expect(look.borderColor).not.toBe(canvas);
  expect(look.outlineStyle).toBe("solid");
  expect(look.outlineColor).not.toBe(canvas);
});
