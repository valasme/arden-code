import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Item } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { ItemView } from "./ItemView";

import "@/styles/global.css";

function renderItem(item: Item, streaming = false) {
  return render(<ItemView item={item} streaming={streaming} />);
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
    ];
    const { container } = render(
      <div>
        {items.map((item) => (
          <ItemView key={item.id} item={item} streaming={false} />
        ))}
      </div>,
    );

    await expectNoAccessibilityViolations(container);
  });
});
