import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userEvent as pointer } from "vitest/browser";

import { contrastRatio, oklchToSrgb, parseColor } from "@/lib/contrast";

import { ChoiceControl } from "./controls";

import "@/styles/global.css";

const options = [
  { value: "system", label: "Same as Windows" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

function renderChoice(onChange: (value: string) => void = () => {}) {
  return render(
    <>
      <h2 id="theme-label">Theme</h2>
      <p id="theme-description">Light or dark.</p>
      <ChoiceControl id="theme" value="system" options={options} onChange={onChange} />
    </>,
  );
}

describe("ChoiceControl", () => {
  it("is one radio group of joined buttons in a row", () => {
    renderChoice();
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    const [first, second, third] = screen
      .getAllByRole("radio")
      .map((radio) => radio.getBoundingClientRect());

    expect(group).toBeVisible();
    expect(screen.getByRole("radio", { name: "Same as Windows" })).toBeChecked();
    // Side by side, each starting where the one before ends.
    expect(second?.top).toBe(first?.top);
    expect(second?.left).toBeCloseTo(first?.right ?? 0, 0);
    expect(third?.left).toBeCloseTo(second?.right ?? 0, 0);
  });

  it("chooses an option when its button is pressed", async () => {
    const user = userEvent.setup();
    const chosen: string[] = [];
    renderChoice((value) => chosen.push(value));

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(chosen).toEqual(["dark"]);
  });

  describe.each(["light", "dark"])("in the %s theme", (theme) => {
    beforeEach(() => {
      document.documentElement.classList.add(theme);
    });
    afterEach(() => {
      document.documentElement.classList.remove(theme);
    });

    it("keeps the chosen option's label readable under the pointer", async () => {
      renderChoice();
      const chosen = screen.getByRole("radio", { name: "Same as Windows" });

      // The browser's own pointer, so that :hover applies.
      await pointer.hover(chosen);

      const { color, backgroundColor } = getComputedStyle(chosen);
      const ratio = contrastRatio(
        oklchToSrgb(parseColor(color)),
        oklchToSrgb(parseColor(backgroundColor)),
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("still answers the pointer on an option that is not chosen", async () => {
      renderChoice();
      const other = screen.getByRole("radio", { name: "Dark" });
      const atRest = getComputedStyle(other).backgroundColor;

      await pointer.hover(other);

      expect(getComputedStyle(other).backgroundColor).not.toBe(atRest);
    });
  });
});
