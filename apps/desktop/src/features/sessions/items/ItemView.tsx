import type { AgentKind, Item } from "@/ipc/bindings";

import { ApprovalItem, type AnswerHandler } from "./ApprovalItem";
import { ErrorItem } from "./ErrorItem";
import { FileChangeItem } from "./FileChangeItem";
import { MarkdownText } from "./MarkdownText";
import { type PlanHandler, PlanItem } from "./PlanItem";
import { type QuestionsHandler, QuestionsItem } from "./QuestionsItem";
import { StatusItem } from "./StatusItem";
import { ThinkingItem } from "./ThinkingItem";
import { ToolCallItem } from "./ToolCallItem";

interface ItemViewProps {
  item: Item;
  /** Whether the item may still grow. */
  streaming: boolean;
  /** The agent that replied. */
  agent: AgentKind;
  /** Hands the person's answer to an approval request back to the agent. */
  onAnswer: AnswerHandler;
  /** Hands the person's answers to the agent's questions back to it. */
  onAnswerQuestions: QuestionsHandler;
  /** Hands the person's answer to the agent's plan back to it. */
  onAnswerPlan: PlanHandler;
}

/** One part of an agent's reply, drawn as what it is. */
export function ItemView({
  item,
  streaming,
  agent,
  onAnswer,
  onAnswerQuestions,
  onAnswerPlan,
}: ItemViewProps) {
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
    case "approval":
      return (
        <ApprovalItem
          id={item.id}
          agent={agent}
          action={item.action}
          subject={item.subject}
          detail={item.detail}
          rule={item.rule}
          state={item.state}
          onAnswer={onAnswer}
        />
      );
    case "questions":
      return (
        <QuestionsItem
          id={item.id}
          agent={agent}
          questions={item.questions}
          answers={item.answers}
          state={item.state}
          onAnswer={onAnswerQuestions}
        />
      );
    case "plan":
      return (
        <PlanItem
          id={item.id}
          agent={agent}
          plan={item.plan}
          feedback={item.feedback}
          state={item.state}
          onAnswer={onAnswerPlan}
        />
      );
  }
  return <StatusItem kind={item.kind} />;
}
