import type { Item } from "@/ipc/bindings";

import { ErrorItem } from "./ErrorItem";
import { FileChangeItem } from "./FileChangeItem";
import { MarkdownText } from "./MarkdownText";
import { StatusItem } from "./StatusItem";
import { ThinkingItem } from "./ThinkingItem";
import { ToolCallItem } from "./ToolCallItem";

/** One part of an agent's reply, drawn as what it is. `streaming` says it may still grow. */
export function ItemView({ item, streaming }: { item: Item; streaming: boolean }) {
  switch (item.type) {
    case "text":
      return <MarkdownText text={item.text} streaming={streaming} />;
    case "thinking":
      return <ThinkingItem text={item.text} streaming={streaming} />;
    case "toolCall":
      return (
        <ToolCallItem
          name={item.name}
          input={item.input}
          status={item.status}
          output={item.output}
        />
      );
    case "fileChange":
      return (
        <FileChangeItem
          path={item.path}
          change={item.change}
          added={item.added}
          removed={item.removed}
        />
      );
    case "error":
      return <ErrorItem message={item.message} code={item.code ?? null} />;
  }
  return <StatusItem kind={item.kind} />;
}
