import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Switch } from "./switch";

import "@/styles/global.css";

const rect = (element: Element) => element.getBoundingClientRect();

function parts() {
  const track = screen.getByRole("switch", { name: "Sound" });
  const thumb = track.querySelector("[data-slot=switch-thumb]");
  if (!thumb) throw new Error("the switch has no thumb");
  return { track, thumb };
}

describe("Switch", () => {
  it("is a bordered track whose square thumb sits inset at the start when off and at the end when on", async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Sound" />);
    const { track, thumb } = parts();

    expect(getComputedStyle(track).borderTopWidth).toBe("1px");
    expect(rect(thumb).width).toBe(rect(thumb).height);
    // Off: the thumb keeps 2px of the track around it, on the start side.
    expect(rect(thumb).left - rect(track).left).toBeCloseTo(3, 0);
    expect(rect(thumb).top - rect(track).top).toBeCloseTo(3, 0);

    await user.click(track);

    expect(track).toBeChecked();
    expect(rect(track).right - rect(thumb).right).toBeCloseTo(3, 0);
  });

  it("fills the track when on, so on and off differ by more than where the thumb is", async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Sound" />);
    const { track } = parts();
    const off = getComputedStyle(track).backgroundColor;

    await user.click(track);

    expect(getComputedStyle(track).backgroundColor).not.toBe(off);
  });
});
