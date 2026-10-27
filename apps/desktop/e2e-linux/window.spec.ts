import { expect, test } from "@playwright/test";

import { launchApp, until } from "./fixtures";

test.describe("the window on Linux", () => {
  test("shows the page in the app's own frame, with Linux window buttons and no window menu", async () => {
    const app = await launchApp();
    try {
      const { session } = app;
      await until(
        async () => (await session.find('[data-area="titlebar"]')) !== undefined,
        "the title bar",
      );

      const labels = await session.run<string[]>(
        `return [...document.querySelectorAll('[data-area="titlebar"] button')]
           .map((button) => button.getAttribute("aria-label") ?? button.textContent.trim());`,
      );

      expect(labels).toEqual(expect.arrayContaining(["Back", "Forward", "Minimize", "Close"]));
      expect(labels.some((label) => label === "Maximize" || label === "Restore")).toBe(true);
      expect(labels).not.toContain("Window menu");
    } finally {
      await app.close();
    }
  });
});
