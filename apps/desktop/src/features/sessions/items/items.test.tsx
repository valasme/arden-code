import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { userEvent as browserUser } from "vitest/browser";

import type { Item, TranscriptView } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";

import type { AnswerHandler } from "./ApprovalItem";
import { TranscriptViewContext } from "../transcriptView";
import { ItemView } from "./ItemView";
import type { PlanHandler } from "./PlanItem";
import type { QuestionsHandler } from "./QuestionsItem";

import "@/styles/global.css";

/** An item as a turn draws it, in a transcript view. */
function itemTree(
  item: Item,
  streaming = false,
  onAnswer = vi.fn<AnswerHandler>(),
  view: TranscriptView = "normal",
) {
  return (
    <TranscriptViewContext value={view}>
      <ItemView
        item={item}
        streaming={streaming}
        agent="claude"
        onAnswer={onAnswer}
        onAnswerQuestions={vi.fn<QuestionsHandler>()}
        onAnswerPlan={vi.fn<PlanHandler>()}
      />
    </TranscriptViewContext>
  );
}

function renderItem(...args: Parameters<typeof itemTree>) {
  return render(itemTree(...args));
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

const textItem = (value: string): Item => ({ type: "text", id: "text-1", text: value });
/**
 * A streaming text item, drawn the same way each time the reply grows: one tree, so React keeps the
 * item and its pace.
 */
const streamingText = (value: string) => (
  <ItemView
    item={textItem(value)}
    streaming
    agent="claude"
    onAnswer={vi.fn<AnswerHandler>()}
    onAnswerQuestions={vi.fn<QuestionsHandler>()}
    onAnswerPlan={vi.fn<PlanHandler>()}
  />
);
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

/** How many characters the item shows on each of the next frames. */
async function shownOverFrames(container: HTMLElement, frames: number) {
  const lengths: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each frame follows the one before
    await nextFrame();
    lengths.push(container.textContent.length);
  }
  return lengths;
}

describe("A reply's text as it streams (#132)", () => {
  it("shows a piece that arrives at once a few characters on every frame, then catches up", async () => {
    const { container, rerender } = render(streamingText("A hash map"));
    await screen.findByText("A hash map");
    // A piece of 50 characters arrives at once, as Claude Code can send.
    const full = "A hash map keeps each value under a key, so a lookup is quick.";
    rerender(streamingText(full));

    const lengths = await shownOverFrames(container, 24);
    // Not all at once, but in steps of a few characters (about eight frames on a quiet machine; a
    // busy one can draw a step a frame late), and then all of it.
    expect(lengths[0]).toBeLessThan(full.length);
    expect(new Set(lengths).size).toBeGreaterThanOrEqual(4);
    expect(lengths.at(-1)).toBe(full.length);
  });

  it("shows a text that is already there at once, as when a session opens mid-reply", async () => {
    const full = "A hash map keeps each value under a key, so a lookup is quick.";
    const { container } = renderItem(textItem(full), true);

    const [first] = await shownOverFrames(container, 1);
    expect(first).toBe(full.length);
  });
});

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

  it("show what the tool answered once opened (ADR 0051)", async () => {
    const user = userEvent.setup();
    renderItem({
      type: "toolCall",
      id: "c",
      name: "run_command",
      input: "cargo test",
      status: "failed",
      output: "error: could not compile",
    });
    expect(screen.getByText("error: could not compile")).not.toBeVisible();

    await user.click(screen.getByText("run_command"));

    expect(screen.getByText("error: could not compile")).toBeVisible();
  });
});

/** Whether a line of text is cut short with an ellipsis rather than shown whole. */
const cutShort = (element: HTMLElement) => element.scrollWidth > element.clientWidth;

describe("Transcript views (ADR 0051)", () => {
  const thinking: Item = { type: "thinking", id: "t", text: "First I will read the file." };
  const longInput = `{"command":"cargo test --workspace --all-features","description":"${"x".repeat(200)}"}`;
  const toolCall: Item = {
    type: "toolCall",
    id: "c",
    name: "Bash",
    input: longInput,
    status: "done",
    output: "test result: ok",
  };

  it("Normal folds the thinking and each tool's output away", () => {
    renderItem(thinking);
    renderItem(toolCall);

    expect(screen.getByText("First I will read the file.")).not.toBeVisible();
    expect(screen.getByText("test result: ok")).not.toBeVisible();
    expect(cutShort(screen.getByText(longInput))).toBe(true);
  });

  it("Thinking opens the thinking, and keeps each tool's output folded", () => {
    renderItem(thinking, false, vi.fn<AnswerHandler>(), "thinking");
    renderItem(toolCall, false, vi.fn<AnswerHandler>(), "thinking");

    expect(screen.getByText("First I will read the file.")).toBeVisible();
    expect(screen.getByText("test result: ok")).not.toBeVisible();
  });

  it("Verbose shows everything, each tool's input in full", () => {
    renderItem(thinking, false, vi.fn<AnswerHandler>(), "verbose");
    renderItem(toolCall, false, vi.fn<AnswerHandler>(), "verbose");

    expect(screen.getByText("First I will read the file.")).toBeVisible();
    expect(screen.getByText("test result: ok")).toBeVisible();
    expect(cutShort(screen.getByText(longInput))).toBe(false);
  });

  it("Verbose shows a tool's output as soon as it comes back", () => {
    const running: Item = { ...toolCall, status: "running", output: null };
    const { rerender } = renderItem(running, true, vi.fn<AnswerHandler>(), "verbose");

    rerender(itemTree(toolCall, true, vi.fn<AnswerHandler>(), "verbose"));

    expect(screen.getByText("test result: ok")).toBeVisible();
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

/** The different values in a computed list, such as one duration for each property. */
function distinct(list: string) {
  return [...new Set(list.split(/,\s*(?![^(]*\))/))];
}

/** How tall a disclosure's content is drawn right now, in pixels: it grows while it opens. */
function drawnHeight(details: Element) {
  return Number.parseFloat(getComputedStyle(details, "::details-content").height);
}

/** The height a disclosure's content settles at, once it has finished moving. */
async function settledHeight(details: Element) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  return drawnHeight(details);
}

function thinkingNote() {
  const note = screen.getByText("Thinking").closest("details");
  if (!note) throw new Error("the thinking is not a disclosure");
  return note;
}

describe("A disclosure", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-motion");
  });

  it("opens to its height in 160ms and closes in 120ms when the person opens and closes it", async () => {
    renderItem({ type: "thinking", id: "t", text: "First I will read the file." });
    const note = thinkingNote();

    expect(drawnHeight(note), "folded, it has no height").toBe(0);
    // Clicked in this task, so what is drawn next is the move's first frame.
    screen.getByText("Thinking").click();

    const opening = getComputedStyle(note, "::details-content");
    expect(distinct(opening.transitionDuration)).toEqual(["0.16s"]);
    expect(distinct(opening.transitionTimingFunction)).toEqual(["cubic-bezier(0, 0, 0, 1)"]);
    expect(drawnHeight(note), "it starts from nothing").toBe(0);
    const height = await settledHeight(note);
    expect(height, "and grows to its content").toBeGreaterThan(0);
    await expectNoAccessibilityViolations(document.body);

    screen.getByText("Thinking").click();

    const closing = getComputedStyle(note, "::details-content");
    expect(distinct(closing.transitionDuration)).toEqual(["0.12s"]);
    expect(distinct(closing.transitionTimingFunction)).toEqual(["cubic-bezier(0.8, 0, 0.78, 1)"]);
    expect(drawnHeight(note), "it starts from its height").toBe(height);
    expect(await settledHeight(note), "and folds away").toBe(0);
  });

  it("moves when opened with Enter and closed with Space", async () => {
    renderItem({ type: "thinking", id: "t", text: "First I will read the file." });
    const note = thinkingNote();
    screen.getByText("Thinking").focus();

    // Real key presses: a summary opens and closes by its own activation, which only the browser runs.
    await browserUser.keyboard("{Enter}");

    expect(note).toHaveAttribute("open");
    expect(note).toHaveAttribute("data-disclosure", "moving");
    expect(distinct(getComputedStyle(note, "::details-content").transitionDuration)).toEqual([
      "0.16s",
    ]);

    await browserUser.keyboard("[Space]");

    expect(note).not.toHaveAttribute("open");
    expect(distinct(getComputedStyle(note, "::details-content").transitionDuration)).toEqual([
      "0.12s",
    ]);
  });

  it("shows as it is when the transcript view changes to Verbose and back", async () => {
    const item: Item = { type: "thinking", id: "t", text: "First I will read the file." };
    const view = (transcript: TranscriptView) =>
      itemTree(item, false, vi.fn<AnswerHandler>(), transcript);
    const { rerender } = render(view("normal"));
    const note = thinkingNote();
    expect(drawnHeight(note), "folded, it has no height").toBe(0);

    rerender(view("verbose"));

    expect(note).toHaveAttribute("open");
    const height = drawnHeight(note);
    expect(height, "open at its full height at once").toBeGreaterThan(0);
    expect(await settledHeight(note)).toBe(height);

    rerender(view("normal"));

    expect(note).not.toHaveAttribute("open");
    expect(drawnHeight(note), "folded at once").toBe(0);
  });

  it("shows as it is when a session opens in a view that opens it", () => {
    renderItem(
      { type: "thinking", id: "t", text: "First I will read the file." },
      false,
      vi.fn<AnswerHandler>(),
      "thinking",
    );

    expect(drawnHeight(thinkingNote())).toBeGreaterThan(0);
  });

  it("opens at once with reduced motion", async () => {
    document.documentElement.dataset["motion"] = "reduce";
    const user = userEvent.setup();
    renderItem({ type: "thinking", id: "t", text: "First I will read the file." });
    const note = thinkingNote();

    await user.click(screen.getByText("Thinking"));

    const durations = getComputedStyle(note, "::details-content").transitionDuration.split(",");
    for (const duration of durations) expect(Number.parseFloat(duration)).toBeLessThan(0.001);
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
