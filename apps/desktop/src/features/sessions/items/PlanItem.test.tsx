import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PlanAnswer, PlanState } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { PlanItem } from "./PlanItem";

import "@/styles/global.css";

const plan = "## Steps\n\n1. Read the build script\n2. Fix the path";

function renderPlan(state: PlanState, text: string | null = plan, feedback: string | null = null) {
  const answers: [string, PlanAnswer, string | null][] = [];
  const view = render(
    <PlanItem
      id="turn-1-plan-r1"
      agent="claude"
      plan={text}
      feedback={feedback}
      state={state}
      onAnswer={(itemId, answer, words) => {
        answers.push([itemId, answer, words]);
      }}
    />,
  );
  return { answers, ...view };
}

describe("PlanItem", () => {
  it("shows the plan as Markdown and starts it accepting edits first", async () => {
    const user = userEvent.setup();
    const { answers } = renderPlan("waiting");

    expect(screen.getByRole("group", { name: "Claude has a plan" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Steps" })).toBeVisible();
    expect(screen.getByText("Fix the path")).toBeVisible();
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["Start, accepting edits", "Start, asking first", "Keep planning"]);
    await user.click(screen.getByRole("button", { name: "Start, accepting edits" }));

    expect(answers).toEqual([["turn-1-plan-r1", "startAcceptingEdits", null]]);
  });

  it("starts it asking first", async () => {
    const user = userEvent.setup();
    const { answers } = renderPlan("waiting");

    await user.click(screen.getByRole("button", { name: "Start, asking first" }));

    expect(answers).toEqual([["turn-1-plan-r1", "startAskingFirst", null]]);
  });

  it("asks what should change before it keeps planning, and sends the words", async () => {
    const user = userEvent.setup();
    const { answers } = renderPlan("waiting");

    await user.click(screen.getByRole("button", { name: "Keep planning" }));
    const field = screen.getByRole("textbox", { name: "What should change?" });
    expect(field).toHaveFocus();
    await user.type(field, "Test it first");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(answers).toEqual([["turn-1-plan-r1", "keepPlanning", "Test it first"]]);
  });

  it("says when Claude sent no plan text, and can still be started", async () => {
    const user = userEvent.setup();
    const { answers } = renderPlan("waiting", null);

    expect(screen.getByText("Claude did not send the plan's text.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Start, asking first" }));

    expect(answers).toHaveLength(1);
  });

  it.each([
    ["startedAcceptingEdits", "You started the plan, accepting edits"],
    ["startedAskingFirst", "You started the plan, asking first"],
    ["keptPlanning", "You asked Claude to keep planning"],
    ["cancelled", "No answer was needed"],
  ] as const)("folds to a line once answered: %s", (state, line) => {
    renderPlan(state);

    expect(screen.getByText(line)).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Start/ })).toBeNull();
  });

  it("keeps the words the person asked to change", () => {
    renderPlan("keptPlanning", plan, "Test it first");

    expect(screen.getByText("Test it first")).toBeVisible();
  });

  it("has no accessibility violations, waiting or answered", async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderPlan("waiting");
    await expectNoAccessibilityViolations(container);
    await user.click(screen.getByRole("button", { name: "Keep planning" }));
    await expectNoAccessibilityViolations(container);
    unmount();

    const answered = renderPlan("startedAcceptingEdits");
    await expectNoAccessibilityViolations(answered.container);
  });
});
