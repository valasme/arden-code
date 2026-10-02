import { render, screen } from "@testing-library/react";

import { PageHeader } from "./PageHeader";

import "@/styles/global.css";

describe("PageHeader", () => {
  it("titles a page with a 20px heading over a muted line", () => {
    render(<PageHeader title="Logs" description="The last 14 days." />);
    const title = screen.getByRole("heading", { level: 1, name: "Logs" });
    const line = screen.getByText("The last 14 days.");

    expect(getComputedStyle(title).fontSize).toBe("20px");
    expect(getComputedStyle(line).color).not.toBe(getComputedStyle(title).color);
    expect(line.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      title.getBoundingClientRect().bottom,
    );
  });

  it("can take the focus, so a page that opens on an error can lead the keyboard to it", () => {
    render(<PageHeader title="Something went wrong" focusOnOpen />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });
});
