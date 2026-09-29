import { render, screen } from "@testing-library/react";

import { expectNoAccessibilityViolations } from "@/test/axe";

import { DesignSystemPage } from "./DesignSystemPage";

import "@/styles/global.css";

afterEach(() => {
  document.documentElement.classList.remove("dark", "light");
});

describe("the design system page", () => {
  it.each(["light", "dark"] as const)(
    "has no accessibility violations in the %s theme",
    async (theme) => {
      const { container } = render(
        <DesignSystemPage
          theme={theme}
          zoom={1}
          onThemeChange={() => {}}
          onZoomChange={() => {}}
        />,
      );

      await expectNoAccessibilityViolations(container);
    },
  );

  it("applies the requested theme to the page", () => {
    render(
      <DesignSystemPage theme="dark" zoom={1} onThemeChange={() => {}} onZoomChange={() => {}} />,
    );

    expect(document.documentElement).toHaveClass("dark");
  });

  it("reports theme and zoom choices", () => {
    const themes: string[] = [];
    const zooms: number[] = [];
    render(
      <DesignSystemPage
        theme="light"
        zoom={1}
        onThemeChange={(theme) => themes.push(theme)}
        onZoomChange={(zoom) => zooms.push(zoom)}
      />,
    );

    screen.getByRole("button", { name: "dark" }).click();
    screen.getByRole("button", { name: "200%" }).click();

    expect(themes).toEqual(["dark"]);
    expect(zooms).toEqual([2]);
  });
});
