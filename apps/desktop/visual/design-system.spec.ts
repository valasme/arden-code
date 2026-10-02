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

/**
 * What a screenshot of the window would miss, in CSS pixels: nothing, when every value is 0 or
 * less.
 */
const missedByTheWindow = (page: Page) =>
  page.evaluate(() => {
    const region = document.querySelector("[data-area=session]");
    const content = region?.querySelector("main");
    const statusBar = document.querySelector("[data-area=statusbar]");
    return {
      scrolledAway: region ? region.scrollHeight - region.clientHeight : Number.NaN,
      pageBelowTheWindow: (content?.getBoundingClientRect().bottom ?? Number.NaN) - innerHeight,
      frameBelowTheWindow: (statusBar?.getBoundingClientRect().bottom ?? Number.NaN) - innerHeight,
    };
  });

/** The theme's system colors, read from a sample drawn in each in turn. */
const systemColors = (page: Page) =>
  page.evaluate(() => {
    const sample = document.createElement("span");
    document.body.append(sample);
    sample.style.color = "Canvas";
    const canvas = getComputedStyle(sample).color;
    sample.style.color = "LinkText";
    const linkText = getComputedStyle(sample).color;
    sample.remove();
    return { canvas, linkText };
  });

/**
 * Opens the page in a window tall enough to show all of it, so a screenshot sees everything. The
 * app's frame is as tall as the window and the page scrolls inside the session view, so it is the
 * window that has to grow: the frame then lays out as it would in a tall window.
 */
async function showWholePage(page: Page, search = "") {
  await openDesignSystem(page, search);
  /* oxlint-disable no-await-in-loop -- each step measures the layout the one before it made */
  for (let step = 0; step < 5; step += 1) {
    const { scrolledAway } = await missedByTheWindow(page);
    if (scrolledAway <= 0) break;
    const { width, height } = page.viewportSize() ?? { width: 1100, height: 900 };
    await page.setViewportSize({ width, height: height + Math.ceil(scrolledAway) });
  }
  /* oxlint-enable no-await-in-loop */
  // A screenshot that would miss part of the page fails here, not by passing quietly.
  const missed = await missedByTheWindow(page);
  expect(Math.max(...Object.values(missed)), JSON.stringify(missed)).toBeLessThanOrEqual(0);
}

for (const { name, colorScheme, forcedColors } of themes) {
  test(`the design system page looks right in ${name}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, forcedColors });
    await showWholePage(page);

    // The window is the whole page now; the document itself never scrolls.
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}

test("the design system page looks right at 200% zoom", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await showWholePage(page, "?zoom=2");

  await expect(page).toHaveScreenshot("zoom-200.png");
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
  const { canvas } = await systemColors(page);

  expect(look.borderStyle).toBe("solid");
  expect(look.borderWidth).toBe("1px");
  expect(look.borderColor).not.toBe(canvas);
  expect(look.outlineStyle).toBe("solid");
  expect(look.outlineColor).not.toBe(canvas);
});

test("in a high contrast theme, a link in an agent's reply has the theme's link color", async ({
  page,
}) => {
  await page.emulateMedia({ forcedColors: "active", colorScheme: "dark" });
  await openDesignSystem(page);

  const link = page.getByRole("link", { name: "link", exact: true });
  const { canvas, linkText } = await systemColors(page);
  const color = await link.evaluate((element) => getComputedStyle(element).color);

  expect(color).toBe(linkText);
  expect(color).not.toBe(canvas);
});
