import { CheckIcon, ListChecksIcon, MinusIcon, PencilIcon } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentKind, PlanAnswer, PlanState } from "@/ipc/bindings";

import { itemLine } from "./itemLine";
import { MarkdownText } from "./MarkdownText";

/** Hands the person's answer to a plan back to the agent, with what should change. */
export type PlanHandler = (itemId: string, answer: PlanAnswer, feedback: string | null) => void;

interface PlanItemProps {
  id: string;
  agent: AgentKind;
  /** The plan as Markdown, or null when the agent sent no text. */
  plan: string | null;
  /** What the person said should change, once they asked to keep planning. */
  feedback: string | null;
  state: PlanState;
  onAnswer: PlanHandler;
}

const answeredIcons = {
  startedAcceptingEdits: CheckIcon,
  startedAskingFirst: CheckIcon,
  keptPlanning: PencilIcon,
  cancelled: MinusIcon,
} as const;

/**
 * An agent's plan, as it asks to leave Plan mode (ADR 0044): the plan as Markdown, then Start,
 * accepting edits; Start, asking first; and Keep planning, which asks what should change. Once
 * answered, the card folds to a line that says what the person decided.
 */
export function PlanItem({ id, agent, plan, feedback, state, onAnswer }: PlanItemProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const [changing, setChanging] = useState(false);
  const [words, setWords] = useState("");
  const [sent, setSent] = useState(false);
  const name = t(`agents.${agent}.name`);

  if (state !== "waiting") {
    const Icon = answeredIcons[state];
    return (
      <div data-item="plan" className={itemLine}>
        <p className="flex min-h-6 items-center gap-2 text-muted-foreground">
          <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
          {t(`items.plan.answered.${state}`, { agent: name })}
        </p>
        {feedback === null ? null : <p className="break-words">{feedback}</p>}
      </div>
    );
  }

  const answer = (given: PlanAnswer, said: string | null = null) => {
    if (sent) return;
    setSent(true);
    onAnswer(id, given, said);
  };
  const keepPlanning = (event: FormEvent) => {
    event.preventDefault();
    const said = words.trim();
    answer("keepPlanning", said === "" ? null : said);
  };

  return (
    <fieldset
      aria-labelledby={headingId}
      data-item="plan"
      className="my-2 flex flex-col gap-2 border border-foreground/30 px-3 py-2.5 text-sm"
    >
      <p id={headingId} className="flex items-center gap-2 font-medium">
        <ListChecksIcon aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
        {t("items.plan.asks", { agent: name })}
      </p>
      {plan === null ? (
        <p className="text-muted-foreground">{t("items.plan.noText", { agent: name })}</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <MarkdownText text={plan} streaming={false} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          size="sm"
          disabled={sent}
          onClick={() => {
            answer("startAcceptingEdits");
          }}
        >
          {t("items.plan.startAcceptingEdits")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={sent}
          onClick={() => {
            answer("startAskingFirst");
          }}
        >
          {t("items.plan.startAskingFirst")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={sent || changing}
          onClick={() => {
            setChanging(true);
          }}
        >
          {t("items.plan.keepPlanning")}
        </Button>
      </div>
      {changing ? (
        <form className="flex items-center gap-2" onSubmit={keepPlanning}>
          <Input
            aria-label={t("items.plan.whatShouldChange")}
            placeholder={t("items.plan.whatShouldChange")}
            value={words}
            // The field appears because the person asked for it: the focus goes there.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="h-7 min-w-0 flex-1"
            onChange={(event) => {
              setWords(event.currentTarget.value);
            }}
          />
          <Button type="submit" size="sm" disabled={sent}>
            {t("items.plan.send")}
          </Button>
        </form>
      ) : null}
    </fieldset>
  );
}
