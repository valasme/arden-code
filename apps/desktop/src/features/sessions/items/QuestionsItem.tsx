import { MessageCircleQuestionIcon, MinusIcon } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentKind, Question, QuestionAnswer, QuestionState } from "@/ipc/bindings";

import { itemLine } from "./itemLine";

/** Hands the person's answers to an agent's questions back to it. */
export type QuestionsHandler = (itemId: string, answers: QuestionAnswer[]) => void;

interface QuestionsItemProps {
  id: string;
  agent: AgentKind;
  questions: Question[];
  answers: QuestionAnswer[];
  state: QuestionState;
  onAnswer: QuestionsHandler;
}

/** What the person has chosen for one question so far. */
interface Choice {
  chosen: string[];
  /** Whether their own answer is chosen, and what it says. */
  own: boolean;
  text: string;
}

const nothingChosen: Choice = { chosen: [], own: false, text: "" };

/** A choice as the answer the agent reads: the options in the order offered, then the person's own. */
function answerOf(question: Question, choice: Choice): string {
  const options = question.options
    .map((option) => option.label)
    .filter((label) => choice.chosen.includes(label));
  const own = choice.own ? choice.text.trim() : "";
  return [...options, ...(own === "" ? [] : [own])].join(", ");
}

/**
 * An agent asking the person to choose (ADR 0039): each question with its options, as radio buttons,
 * or check boxes when several may be chosen, and a field for an answer of the person's own. Once
 * sent, it folds into the answers.
 */
export function QuestionsItem({
  id,
  agent,
  questions,
  answers,
  state,
  onAnswer,
}: QuestionsItemProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [choices, setChoices] = useState<Choice[]>(() => questions.map(() => nothingChosen));
  const [sent, setSent] = useState(false);

  if (state !== "waiting") {
    return (
      <div data-item="questions" className={itemLine}>
        {state === "cancelled" ? (
          <p className="flex min-h-6 items-center gap-2 text-muted-foreground">
            <MinusIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
            {t("items.questions.cancelled")}
          </p>
        ) : null}
        <dl className="flex flex-col gap-1 py-0.5">
          {questions.map((question) => (
            <div key={question.question} className="flex flex-col">
              <dt className="text-muted-foreground">{question.question}</dt>
              {state === "answered" ? (
                <dd className="font-medium break-words">
                  {answers.find((answer) => answer.question === question.question)?.answer ?? ""}
                </dd>
              ) : null}
            </div>
          ))}
        </dl>
      </div>
    );
  }

  const given = questions.map((question, index) =>
    answerOf(question, choices[index] ?? nothingChosen),
  );
  const complete = given.every((answer) => answer !== "");
  const update = (index: number, change: (choice: Choice, question: Question) => Choice) => {
    setChoices((current) =>
      current.map((choice, at) => {
        const question = questions[at];
        return at === index && question ? change(choice, question) : choice;
      }),
    );
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!complete || sent) return;
    setSent(true);
    onAnswer(
      id,
      questions.map((question, index) => ({
        question: question.question,
        answer: given[index] ?? "",
      })),
    );
  };

  return (
    <form
      aria-labelledby={`${formId}-heading`}
      data-item="questions"
      className="my-2 flex flex-col gap-3 border border-foreground/30 px-3 py-2.5 text-sm"
      onSubmit={submit}
    >
      <p id={`${formId}-heading`} className="flex items-center gap-2 font-medium">
        <MessageCircleQuestionIcon aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
        {t("items.questions.asks", { agent: t(`agents.${agent}.name`) })}
      </p>
      {questions.map((question, index) => {
        const choice = choices[index] ?? nothingChosen;
        const name = `${formId}-${index}`;
        const kind = question.multiSelect ? "checkbox" : "radio";
        return (
          <fieldset
            key={question.question}
            role={question.multiSelect ? undefined : "radiogroup"}
            className="flex flex-col gap-1.5"
          >
            <legend className="mb-1.5 flex flex-col">
              {question.header === "" ? null : (
                <span className="text-2xs text-muted-foreground uppercase">{question.header}</span>
              )}
              <span className="font-medium">{question.question}</span>
            </legend>
            {question.options.map((option, at) => {
              const optionId = `${name}-${at}`;
              const checked = choice.chosen.includes(option.label);
              return (
                <div key={option.label} className="flex items-start gap-2">
                  <input
                    id={optionId}
                    type={kind}
                    name={name}
                    checked={checked}
                    aria-describedby={option.description ? `${optionId}-description` : undefined}
                    className="mt-0.5 size-4 shrink-0 accent-foreground"
                    onChange={(event) => {
                      const on = event.currentTarget.checked;
                      update(index, (current) =>
                        question.multiSelect
                          ? {
                              ...current,
                              chosen: on
                                ? [...current.chosen, option.label]
                                : current.chosen.filter((label) => label !== option.label),
                            }
                          : { ...current, chosen: [option.label], own: false },
                      );
                    }}
                  />
                  <div className="flex min-w-0 flex-col">
                    <label htmlFor={optionId}>{option.label}</label>
                    {option.description ? (
                      <p id={`${optionId}-description`} className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <input
                id={`${name}-own`}
                type={kind}
                name={name}
                checked={choice.own}
                className="size-4 shrink-0 accent-foreground"
                onChange={(event) => {
                  const on = event.currentTarget.checked;
                  update(index, (current) =>
                    question.multiSelect
                      ? { ...current, own: on }
                      : { ...current, chosen: [], own: true },
                  );
                }}
              />
              <label htmlFor={`${name}-own`} className="shrink-0">
                {t("items.questions.other")}
              </label>
              <Input
                aria-label={t("items.questions.own", { question: question.question })}
                value={choice.text}
                className="h-7 min-w-0 flex-1"
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  update(index, (current) => ({
                    ...current,
                    text,
                    own: text.trim() !== "" || current.own,
                    chosen: question.multiSelect || text.trim() === "" ? current.chosen : [],
                  }));
                }}
              />
            </div>
          </fieldset>
        );
      })}
      <div>
        <Button type="submit" size="sm" disabled={!complete || sent}>
          {t("items.questions.send")}
        </Button>
      </div>
    </form>
  );
}
