import { render, screen } from "@testing-library/react";
import { BrainIcon } from "lucide-react";

import { ChoiceButton } from "./ChoiceButton";

import "@/styles/global.css";

describe("ChoiceButton", () => {
  it("draws its icon 16 px wide, in the color of its label", () => {
    render(<ChoiceButton icon={BrainIcon} value="Opus 5.5" aria-label="Model: Opus 5.5" />);

    const button = screen.getByRole("button", { name: "Model: Opus 5.5" });
    const icon = button.querySelector("svg");
    const label = button.querySelector("span");
    if (!icon || !label) throw new Error("The button has no icon or no label.");

    expect(getComputedStyle(icon).width).toBe("16px");
    expect(getComputedStyle(icon).color).toBe(getComputedStyle(label).color);
  });
});
