import { CheckIcon, MinusIcon, ShieldQuestionIcon, XIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { AgentKind, Answer, ApprovalAction, ApprovalState } from "@/ipc/bindings";

import { itemLine } from "./itemLine";

/** Hands the person's answer to an approval request back to the agent. */
export type AnswerHandler = (itemId: string, answer: Answer) => void;

interface ApprovalItemProps {
  id: string;
  agent: AgentKind;
  action: ApprovalAction;
  subject: string;
  detail: string | null;
  rule: string | null;
  state: ApprovalState;
  onAnswer: AnswerHandler;
}

const answeredIcons = {
  allowed: CheckIcon,
  alwaysAllowed: CheckIcon,
  denied: XIcon,
  cancelled: MinusIcon,
} as const;

/**
 * An agent asking before it acts (ADR 0039): what it wants to do in Arden Code's words, the details
 * to decide by, and the answers. Always allow appears only when the agent suggested a rule to
 * remember. Once answered, the card folds to a quiet line that says what the person decided.
 */
export function ApprovalItem({
  id,
  agent,
  action,
  subject,
  detail,
  rule,
  state,
  onAnswer,
}: ApprovalItemProps) {
  const { t } = useTranslation();
  const headingId = useId();

  if (state !== "waiting") {
    const Icon = answeredIcons[state];
    return (
      <div data-item="approval" className={itemLine}>
        <div className="flex min-h-6 items-center gap-2">
          <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <span className="shrink-0 text-muted-foreground">
            {t(`items.approval.answered.${state}`)}
          </span>
          <code className="min-w-0 flex-1 truncate">{subject}</code>
        </div>
      </div>
    );
  }

  return (
    <fieldset
      aria-labelledby={headingId}
      data-item="approval"
      className="my-2 flex flex-col gap-2 border border-foreground/30 px-3 py-2.5 text-sm"
    >
      <p id={headingId} className="flex items-center gap-2 font-medium">
        <ShieldQuestionIcon aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
        {t(`items.approval.asks.${action}`, { agent: t(`agents.${agent}.name`) })}
      </p>
      <code className="block bg-muted px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap">
        {subject}
      </code>
      {detail === null ? null : (
        <p className="font-mono text-xs break-words whitespace-pre-wrap text-muted-foreground">
          {detail}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => {
            onAnswer(id, "allow");
          }}
        >
          {t("items.approval.allow")}
        </Button>
        {rule === null ? null : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onAnswer(id, "alwaysAllow");
            }}
          >
            {t("items.approval.alwaysAllow")}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onAnswer(id, "deny");
          }}
        >
          {t("items.approval.deny")}
        </Button>
      </div>
      {rule === null ? null : (
        <p className="text-xs text-muted-foreground">{t("items.approval.rule", { rule })}</p>
      )}
    </fieldset>
  );
}
