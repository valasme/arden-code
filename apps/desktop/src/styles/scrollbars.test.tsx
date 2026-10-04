import { render, screen } from "@testing-library/react";

import "@/styles/global.css";

describe("scrollbars", () => {
  it("are thin, 10px whatever the zoom, and have no arrow buttons", () => {
    document.documentElement.style.setProperty("--zoom", "2");
    render(
      <section aria-label="Long list" style={{ height: 100, overflowY: "auto" }}>
        <div style={{ height: 1000 }}>Long content</div>
      </section>,
    );
    const region = screen.getByRole("region", { name: "Long list" });

    // The test browser draws overlay scrollbars that take no room, so the style is read instead.
    expect(getComputedStyle(region, "::-webkit-scrollbar").width).toBe("10px");
    expect(getComputedStyle(region, "::-webkit-scrollbar-button").display).toBe("none");
    document.documentElement.style.removeProperty("--zoom");
  });
});
