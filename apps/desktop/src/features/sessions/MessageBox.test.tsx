import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { expectNoAccessibilityViolations } from "@/test/axe";

import { MessageBox } from "./MessageBox";
import { useUltrathink } from "./ultrathink";

import "@/styles/global.css";

/** A message box with the Ultrathink switch, wired as a session's is, and a way to turn it on. */
function Harness() {
  const { ultrathink, setUltrathink, carrying } = useUltrathink();
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
