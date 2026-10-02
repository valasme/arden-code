import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
});
