import type { Item } from "@/ipc/bindings";
import { ItemView } from "@/features/sessions/items/ItemView";

const markdown = `## Markdown in a reply

Text with **bold**, *emphasis*, \`inline code\` and a [link](https://example.com). An image is never loaded: ![a diagram](https://example.com/diagram.png)

- A list
- With two items

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

| Item | Shown as |
| --- | --- |
| Tool call | A card |
| File change | A card with counts |

> A quotation, such as the message the Demo agent repeats.
`;

/** One of every kind of item, as a reply can hold them. */
const items: readonly Item[] = [
  { type: "status", id: "status", kind: "started" },
  {
    type: "thinking",
    id: "thinking",
    text: "The person asked for a change. I will read the file first, then edit it.",
  },
  {
    type: "toolCall",
    id: "tool-running",
    name: "read_file",
    input: "src/main.ts",
    status: "running",
    output: null,
  },
  {
    type: "toolCall",
    id: "tool-done",
    name: "read_file",
    input: "README.md",
    status: "done",
    output: "42 lines",
  },
  {
    type: "toolCall",
    id: "tool-failed",
    name: "run_command",
    input: "cargo test",
    status: "failed",
    output: "error: could not compile `demo`",
  },
  { type: "text", id: "text", text: markdown },
  {
    type: "fileChange",
    id: "file-created",
    path: "notes/demo.md",
    change: "created",
    added: 12,
    removed: 0,
  },
  {
    type: "fileChange",
    id: "file-modified",
    path: "src/main.ts",
    change: "modified",
    added: 3,
    removed: 1,
  },
  {
    type: "fileChange",
    id: "file-deleted",
    path: "old/notes.txt",
    change: "deleted",
    added: 0,
    removed: 8,
  },
  { type: "error", id: "error", message: "The agent could not finish: the file is read-only." },
  { type: "status", id: "stopped", kind: "stopped" },
];

/**
 * The kinds of item in a reply, for the design system page. Approval requests and questions wait
 * for an answer, so they are shown where they are tested, in the session.
 */
export function SessionItemsSample() {
  return (
    <div className="max-w-2xl border border-border p-4">
      {items.map((item) => (
        <ItemView
          key={item.id}
          item={item}
          streaming={false}
          agent="claude"
          onAnswer={() => undefined}
          onAnswerQuestions={() => undefined}
        />
      ))}
    </div>
  );
}
