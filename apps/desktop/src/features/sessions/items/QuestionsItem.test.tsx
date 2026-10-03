import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Question, QuestionAnswer, QuestionState } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { type QuestionsHandler, QuestionsItem } from "./QuestionsItem";

import "@/styles/global.css";

const library: Question = {
  header: "Library",
  question: "Which library should the app use?",
  options: [
    { label: "React", description: "The one the app already uses" },
    { label: "Vue", description: null },
  ],
  multiSelect: false,
};

const checks: Question = {
  header: "Checks",
  question: "Which checks should run?",
  options: [
    { label: "Tests", description: null },
    { label: "Lint", description: null },
    { label: "Types", description: null },
  ],
  multiSelect: true,
};

function renderQuestions({
  questions = [library],
  answers = [],
  state = "waiting",
  onAnswer = vi.fn<QuestionsHandler>(),
}: {
  questions?: Question[];
  answers?: QuestionAnswer[];
  state?: QuestionState;
  onAnswer?: QuestionsHandler;
} = {}) {
  return render(
    <QuestionsItem
      id="turn-1-questions-1"
      agent="claude"
      questions={questions}
      answers={answers}
      state={state}
      onAnswer={onAnswer}
    />,
  );
}

const send = () => screen.getByRole("button", { name: "Send answers" });

describe("Claude's questions", () => {
  it("show each question with its options and what each means", () => {
    renderQuestions();

    const card = screen.getByRole("form", { name: "Claude asks you" });
    const question = within(card).getByRole("radiogroup", {
      name: /Which library should the app use\?/u,
    });
    expect(within(question).getByRole("radio", { name: "React" })).toHaveAccessibleDescription(
      "The one the app already uses",
    );
    expect(within(question).getByRole("radio", { name: "Vue" })).toBeVisible();
    expect(within(question).getByRole("radio", { name: "Other" })).toBeVisible();
    expect(send()).toBeDisabled();
  });

  it("send the option chosen, under the question's text", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn<QuestionsHandler>();
    renderQuestions({ onAnswer });

    await user.click(screen.getByRole("radio", { name: "React" }));
    await user.click(send());

    expect(onAnswer).toHaveBeenCalledWith("turn-1-questions-1", [
      { question: "Which library should the app use?", answer: "React" },
    ]);
    expect(send(), "sent once").toBeDisabled();
  });

  it("let several options be chosen when the question allows it, in the order they are offered", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn<QuestionsHandler>();
    renderQuestions({ questions: [library, checks], onAnswer });

    await user.click(screen.getByRole("radio", { name: "Vue" }));
    await user.click(screen.getByRole("checkbox", { name: "Types" }));
    expect(send(), "every question needs an answer").toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: "Tests" }));
    await user.click(send());

    expect(onAnswer).toHaveBeenCalledWith("turn-1-questions-1", [
      { question: "Which library should the app use?", answer: "Vue" },
      { question: "Which checks should run?", answer: "Tests, Types" },
    ]);
  });

  it("take an answer of the person's own", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn<QuestionsHandler>();
    renderQuestions({ questions: [library, checks], onAnswer });

    await user.type(
      screen.getByRole("textbox", {
        name: "Your own answer to: Which library should the app use?",
      }),
      "Svelte",
    );
    expect(screen.getAllByRole("radio", { name: "Other" })[0]).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Lint" }));
    await user.type(
      screen.getByRole("textbox", { name: "Your own answer to: Which checks should run?" }),
      "Format",
    );
    await user.click(send());

    expect(onAnswer).toHaveBeenCalledWith("turn-1-questions-1", [
      { question: "Which library should the app use?", answer: "Svelte" },
      { question: "Which checks should run?", answer: "Lint, Format" },
    ]);
  });

  it("can be answered with the keyboard alone", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn<QuestionsHandler>();
    renderQuestions({ onAnswer });

    await user.tab();
    expect(screen.getByRole("radio", { name: "React" })).toHaveFocus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Vue" })).toBeChecked();
    await user.tab();
    await user.tab();
    expect(send()).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onAnswer).toHaveBeenCalledWith("turn-1-questions-1", [
      { question: "Which library should the app use?", answer: "Vue" },
    ]);
  });

  it("fold into the answers once sent", () => {
    renderQuestions({
      questions: [library, checks],
      answers: [
        { question: "Which library should the app use?", answer: "React" },
        { question: "Which checks should run?", answer: "Tests, Lint" },
      ],
      state: "answered",
    });

    expect(screen.getByText("Which library should the app use?")).toBeVisible();
    expect(screen.getByText("React")).toBeVisible();
    expect(screen.getByText("Tests, Lint")).toBeVisible();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("say no answer was needed once the reply stopped", () => {
    renderQuestions({ state: "cancelled" });

    expect(screen.getByText("No answer was needed")).toBeVisible();
    expect(screen.getByText("Which library should the app use?")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("have no accessibility violations while waiting and once answered", async () => {
    const { container, unmount } = renderQuestions({ questions: [library, checks] });
    await expectNoAccessibilityViolations(container);
    unmount();

    const answered = renderQuestions({
      answers: [{ question: "Which library should the app use?", answer: "React" }],
      state: "answered",
    });
    await expectNoAccessibilityViolations(answered.container);
  });
});
