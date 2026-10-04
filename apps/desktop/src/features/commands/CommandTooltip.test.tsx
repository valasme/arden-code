import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userEvent as realInput } from "vitest/browser";

import { CommandTooltip } from "./CommandTooltip";

import "@/styles/global.css";

function renderButtons() {
  return render(
    <div>
      <button type="button">Before</button>
      <CommandTooltip command="session.new">
        <button type="button">New session</button>
      </CommandTooltip>
    </div>,
  );
}

/** Waits past the tooltip's hover delay, so a tooltip that was going to open has opened. */
async function waitPastDelay() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 700);
    });
  });
}

describe("CommandTooltip", () => {
  it("opens no tooltip when the app moves focus to its control after a click, as a closing dialog does", async () => {
    renderButtons();
    // A real click, through the browser: a click from a script would not count as the pointer's.
    await realInput.click(screen.getByRole("button", { name: "Before" }));

    act(() => {
      screen.getByRole("button", { name: "New session" }).focus();
    });
    await waitPastDelay();

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows on keyboard focus", async () => {
    renderButtons();
    screen.getByRole("button", { name: "Before" }).focus();

    await realInput.tab();

    expect(await screen.findByRole("tooltip")).toHaveTextContent("New session");
  });

  it("shows on hover after the delay, and hides when the pointer leaves", async () => {
    const user = userEvent.setup();
    renderButtons();

    await user.hover(screen.getByRole("button", { name: "New session" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Ctrl+N");
    await user.unhover(screen.getByRole("button", { name: "New session" }));

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });

  it("closes with Escape", async () => {
    const user = userEvent.setup();
    renderButtons();
    await user.hover(screen.getByRole("button", { name: "New session" }));
    await screen.findByRole("tooltip");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).toBeNull();
    });
  });
});
