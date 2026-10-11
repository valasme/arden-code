import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BotIcon, BrainIcon, ChartNoAxesColumnIcon, FolderIcon, ShieldIcon } from "lucide-react";

import { expectNoAccessibilityViolations } from "@/test/axe";

import { ChoiceButton } from "./ChoiceButton";
import { MessageBox } from "./MessageBox";
import { useUltrathink } from "./ultrathink";

import "@/styles/global.css";

/** A message box with the Ultrathink switch, wired as a session's is, and a way to turn it on. */
function Harness() {
  const { ultrathink, setUltrathink, carrying } = useUltrathink("session-1");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUltrathink(true);
        }}
      >
        Switch on
      </button>
      <MessageBox
        draft="session-1"
        agent="claude"
        busy={false}
        choices={null}
        ultrathink={{
          on: ultrathink,
          onTurnOff: () => {
            setUltrathink(false);
          },
        }}
        onSend={carrying(() => true)}
        onStop={() => {}}
      />
    </>
  );
}

describe("The Ultrathink chip (ADR 0044)", () => {
  it("is not there while the next message will not carry the word", () => {
    render(<Harness />);

    expect(screen.queryByText("Ultrathink")).toBeNull();
  });

  it("shows while the switch is on, and its button turns the switch off", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Switch on" }));
    expect(screen.getByText("Ultrathink")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Turn off Ultrathink" }));

    expect(screen.queryByText("Ultrathink")).toBeNull();
  });

  it("shows, with no button, while the message holds the word", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("textbox", { name: "Message" }), "please ultrathink this");

    expect(screen.getByText("Ultrathink")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Turn off Ultrathink" })).toBeNull();
  });

  it("is not there for a slash command, which never carries the word", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Switch on" }));
    await user.type(screen.getByRole("textbox", { name: "Message" }), "/compact");

    expect(screen.queryByText("Ultrathink")).toBeNull();
  });

  it("goes once the message that carried the word is sent", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Switch on" }));
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Why?{Enter}");

    expect(screen.queryByText("Ultrathink")).toBeNull();
  });

  it("has no accessibility violations while it shows", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Switch on" }));
    // The message box alone: the harness's own button is not part of it.
    const box = container.querySelector("[data-area=messagebox]");
    if (!box) throw new Error("no message box");

    await expectNoAccessibilityViolations(box);
  });
});

/**
 * The welcome screen's Claude message box, with its five menus and the usage limits, and the
 * Ultrathink chip when its switch is on.
 */
function ClaudeBox({
  width = "40rem",
  ultrathink = false,
}: {
  width?: string;
  ultrathink?: boolean;
}) {
  const choices = [
    ["Agent", BotIcon, "Claude"],
    ["Project", FolderIcon, "arden-code"],
    ["Model", BrainIcon, "Opus"],
    ["Effort", ChartNoAxesColumnIcon, "Default"],
    ["Permission mode", ShieldIcon, "Auto"],
  ] as const;
  return (
    // By default, the width of the welcome screen in the maintainer's screenshot.
    <div style={{ width }}>
      <MessageBox
        draft="welcome"
        agent="claude"
        busy={false}
        choices={choices.map(([name, icon, value]) => (
          <ChoiceButton key={name} icon={icon} value={value} aria-label={`${name}: ${value}`} />
        ))}
        figures={<button type="button">5-hour 0% · Weekly 39%</button>}
        {...(ultrathink ? { ultrathink: { on: true, onTurnOff: () => {} } } : {})}
        onSend={() => true}
        onStop={() => {}}
      />
    </div>
  );
}

/** How far down the page the middle of the button with this name is, in CSS pixels. */
function middle(name: string) {
  const box = screen.getByRole("button", { name }).getBoundingClientRect();
  return box.top + box.height / 2;
}

describe("The message box's lower line (ADR 0045)", () => {
  it("keeps Send on the row of the last menu, and the figures under the box", () => {
    const { container } = render(<ClaudeBox />);
    const frame = container.querySelector("[data-message-frame]");
    if (!frame) throw new Error("no message frame");

    const send = screen.getByRole("button", { name: "Send" }).getBoundingClientRect();
    const lastMenu = screen
      .getByRole("button", { name: "Permission mode: Auto" })
      .getBoundingClientRect();
    const figures = screen.getByRole("button", { name: /5-hour/u }).getBoundingClientRect();

    expect(
      Math.abs(send.top + send.height / 2 - (lastMenu.top + lastMenu.height / 2)),
    ).toBeLessThan(2);
    expect(figures.top).toBeGreaterThanOrEqual(frame.getBoundingClientRect().bottom);
  });

  it("wraps Send with the last menu when the box is narrow", () => {
    render(<ClaudeBox width="24rem" />);

    expect(middle("Permission mode: Auto")).toBeGreaterThan(middle("Agent: Claude"));
    expect(Math.abs(middle("Send") - middle("Permission mode: Auto"))).toBeLessThan(2);
  });

  it("never puts Send on a row of its own, at any width (#127)", () => {
    // In the maintainer's screenshot the five menus and the Ultrathink chip just filled the row,
    // and Send went under them alone. Which width does that depends on the font, so try them all.
    const { rerender } = render(<ClaudeBox ultrathink />);

    for (let width = 320; width <= 760; width += 2) {
      rerender(<ClaudeBox ultrathink width={`${width}px`} />);

      expect
        .soft(Math.abs(middle("Send") - middle("Turn off Ultrathink")), `at ${width}px`)
        .toBeLessThan(2);
    }
  });

  it("gives Send no fill while there is nothing to send, and fills it once there is", async () => {
    const user = userEvent.setup();
    render(<ClaudeBox />);
    const send = screen.getByRole("button", { name: "Send" });

    expect(getComputedStyle(send).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Hi");

    expect(getComputedStyle(send).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });
});
