import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Item } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";

import type { AnswerHandler } from "./ApprovalItem";
import { ItemView } from "./ItemView";
import type { PlanHandler } from "./PlanItem";
import type { QuestionsHandler } from "./QuestionsItem";

import "@/styles/global.css";

function renderItem(item: Item, streaming = false, onAnswer = vi.fn<AnswerHandler>()) {
  return render(
    <ItemView
      item={item}
      streaming={streaming}
      agent="claude"
      onAnswer={onAnswer}
      onAnswerQuestions={vi.fn<QuestionsHandler>()}
      onAnswerPlan={vi.fn<PlanHandler>()}
    />,
  );
}

function approval(overrides: Partial<Extract<Item, { type: "approval" }>> = {}): Item {
  return {
    type: "approval",
    id: "turn-1-approval-7",
    toolCallId: "turn-1-toolu_1",
    action: "runCommand",
    subject: "npm test",
    detail: "Run the tests",
    rule: null,
    state: "waiting",
    ...overrides,
  };
}

describe("Tool calls", () => {
  it.each([
    ["running", "Running…"],
    ["done", "Done"],
    ["failed", "Failed"],
  ] as const)("say when they are %s", (status, label) => {
    renderItem({
      type: "toolCall",
      id: "c",
      name: "read_file",
      input: "README.md",
      status,
      output: null,
    });

    expect(screen.getByText("read_file")).toBeVisible();
    expect(screen.getByText("README.md")).toBeVisible();
    expect(screen.getByText(label)).toBeVisible();
  });

  it("show what the tool answered", () => {
    renderItem({
      type: "toolCall",
      id: "c",
      name: "run_command",
      input: "cargo test",
      status: "failed",
      output: "error: could not compile",
    });

    expect(screen.getByText("error: could not compile")).toBeVisible();
  });
});

describe("File changes", () => {
  it.each([
    ["created", "Created"],
    ["modified", "Changed"],
    ["deleted", "Deleted"],
  ] as const)("say a file was %s", (change, label) => {
    renderItem({ type: "fileChange", id: "f", path: "src/main.ts", change, added: 3, removed: 1 });

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText("src/main.ts")).toBeVisible();
  });

  it("give the counts in words for a screen reader, not only as signs", () => {
    renderItem({
      type: "fileChange",
      id: "f",
      path: "src/main.ts",
      change: "modified",
      added: 3,
      removed: 1,
    });

    expect(screen.getByText("3 lines added, 1 lines removed")).toBeInTheDocument();
    expect(screen.getByText("+3 −1")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Thinking", () => {
  it("is folded away until it is opened", async () => {
    const user = userEvent.setup();
    renderItem({ type: "thinking", id: "t", text: "First I will read the file." });
    const note = screen.getByText("Thinking").closest("details");
    expect(note).not.toHaveAttribute("open");
    expect(screen.getByText("First I will read the file.")).not.toBeVisible();

    await user.click(screen.getByText("Thinking"));

    expect(note).toHaveAttribute("open");
    expect(screen.getByText("First I will read the file.")).toBeVisible();
  });

  it("says it is still going while the reply streams", () => {
    renderItem({ type: "thinking", id: "t", text: "Hmm" }, true);

    expect(screen.getByText("Thinking…")).toBeVisible();
  });
});

describe("Errors and status markers", () => {
  it("shows what went wrong, labeled as an error", () => {
    renderItem({ type: "error", id: "e", message: "The file is read-only." });

    const error = screen.getByText("The file is read-only.", { exact: false });
    expect(within(error).getByText("Error:")).toBeVisible();
  });

  it.each([
    ["started", "The agent started working"],
    ["stopped", "You stopped the reply"],
  ] as const)("say when the reply %s", (kind, text) => {
    renderItem({ type: "status", id: "s", kind });

    expect(screen.getByText(text)).toBeVisible();
  });
});

describe("Approval requests", () => {
  it("say what the agent wants to do, with the details to decide by", () => {
    renderItem(approval());

    const card = screen.getByRole("group", { name: "Claude wants to run a command" });
    expect(within(card).getByText("npm test")).toBeVisible();
    expect(within(card).getByText("Run the tests")).toBeVisible();
    expect(within(card).getByRole("button", { name: "Allow" })).toBeVisible();
    expect(within(card).getByRole("button", { name: "Deny" })).toBeVisible();
    expect(
      within(card).queryByRole("button", { name: "Always allow" }),
      "no rule was suggested",
    ).toBeNull();
  });

  it.each([
    ["editFile", "Claude wants to edit a file"],
    ["createFile", "Claude wants to create a file"],
    ["openPage", "Claude wants to open a web page"],
    ["searchWeb", "Claude wants to search the web"],
    ["useTool", "Claude wants to use a tool"],
  ] as const)("name %s in Arden Code's words", (action, heading) => {
    renderItem(approval({ action }));

    expect(screen.getByRole("group", { name: heading })).toBeVisible();
  });

  it("offer Always allow, with the rule it remembers, when the agent suggests one", () => {
    renderItem(approval({ rule: "Bash(npm test:*)" }));

    expect(screen.getByRole("button", { name: "Always allow" })).toBeVisible();
    expect(screen.getByText(/Bash\(npm test:\*\)/u)).toBeVisible();
  });

  it.each([
    ["Allow", "allow"],
    ["Always allow", "alwaysAllow"],
    ["Deny", "deny"],
  ] as const)("hand %s back", async (button, answer) => {
    const user = userEvent.setup();
    const onAnswer = vi.fn<AnswerHandler>();
    renderItem(approval({ rule: "Bash(npm test:*)" }), true, onAnswer);

    await user.click(screen.getByRole("button", { name: button }));

    expect(onAnswer).toHaveBeenCalledWith("turn-1-approval-7", answer);
  });

  it.each([
    ["allowed", "You allowed"],
    ["alwaysAllowed", "You always allowed"],
    ["denied", "You denied"],
    ["cancelled", "No answer was needed"],
  ] as const)("fold to a quiet line once %s", (state, line) => {
    renderItem(approval({ state }));

    expect(screen.getByText(line)).toBeVisible();
    expect(screen.getByText("npm test")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Run the tests"), "the details fold away").toBeNull();
  });
});

describe("Every kind of item", () => {
  it("has no accessibility violations", async () => {
    const items: Item[] = [
      { type: "status", id: "1", kind: "started" },
      { type: "thinking", id: "2", text: "Thinking it over." },
      {
        type: "toolCall",
        id: "3",
        name: "run_command",
        input: "cargo test",
        status: "failed",
        output: "no",
      },
      {
        type: "toolCall",
        id: "4",
        name: "read_file",
        input: "a.txt",
        status: "running",
        output: null,
      },
      { type: "fileChange", id: "5", path: "a.txt", change: "deleted", added: 0, removed: 4 },
      { type: "error", id: "6", message: "It broke." },
      { type: "status", id: "7", kind: "stopped" },
      approval({
        id: "8",
        action: "editFile",
        subject: "src/a.ts",
        detail: "- a\n+ b",
        rule: "Edit",
      }),
      approval({ id: "9", state: "allowed" }),
      {
        type: "questions",
        id: "10",
        toolCallId: null,
        questions: [
          {
            header: "Library",
            question: "Which library?",
            options: [{ label: "React", description: "The one in use" }],
            multiSelect: false,
          },
        ],
        answers: [],
        state: "waiting",
      },
    ];
    const { container } = render(
      <div>
        {items.map((item) => (
          <ItemView
            key={item.id}
            item={item}
            streaming={false}
            agent="claude"
            onAnswer={vi.fn<AnswerHandler>()}
            onAnswerQuestions={vi.fn<QuestionsHandler>()}
            onAnswerPlan={vi.fn<PlanHandler>()}
          />
        ))}
      </div>,
    );

    await expectNoAccessibilityViolations(container);
  });
});
