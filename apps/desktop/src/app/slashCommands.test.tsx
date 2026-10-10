import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { Catalog, Session, SlashCommand } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { useSessionDialogsStore } from "@/state/sessionDialogs";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

function command(name: string, extra: Partial<SlashCommand> = {}): SlashCommand {
  return { name, description: "", argumentHint: "", aliases: [], builtin: false, ...extra };
}

const catalog: Catalog = {
  terminalCommands: ["doctor"],
  models: [
    {
      value: "default",
      displayName: "Default",
      description: "",
      resolvedModel: null,
      efforts: ["low", "medium", "high", "extraHigh", "max"],
    },
    {
      value: "opus",
      displayName: "Opus 5.5",
      description: "",
      resolvedModel: "claude-opus-5-5",
      efforts: ["low", "medium", "high", "extraHigh", "max"],
    },
    {
      value: "claude-opus-4-6",
      displayName: "Opus 4.6",
      description: "",
      resolvedModel: null,
      efforts: ["low", "medium", "high", "max"],
    },
  ],
  commands: [
    command("compact", {
      builtin: true,
      description: "Free up context by summarizing the conversation so far",
      argumentHint: "<optional custom summarization instructions>",
    }),
    command("context", { builtin: true, description: "Show current context usage" }),
    command("doctor", { builtin: true }),
    command("model", { builtin: true, argumentHint: "<model>" }),
    command("mattpocock-skills:tdd", {
      aliases: ["tdd"],
      description: "(mattpocock-skills) Test-driven development.",
    }),
  ],
};

function answered(agent: "claude" | "demo" = "claude"): Session {
  return {
    ...sessionNamed("session-1", "Fix the build", "playground", agent),
    turns: [
      {
        id: "turn-1",
        prompt: "Fix the build",
        startedAt: "2026-10-03T09:00:00Z",
        status: "done",
        items: [{ type: "text", id: "turn-1-text", text: "Fixed." }],
      },
    ],
  };
}

async function open(agent: "claude" | "demo" = "claude") {
  const rust = startSessionsRust({ sessions: [answered(agent)], catalog });
  const user = userEvent.setup();
  render(<App history={createMemoryHistory({ initialEntries: ["/session/session-1"] })} />);
  const box = await screen.findByRole("textbox", { name: "Message" });
  // The list of commands arrives a moment after the page.
  if (agent === "claude") await screen.findByRole("button", { name: /^Model:/ });
  return { rust, user, box };
}

const optionNames = () =>
  screen.queryAllByRole("option").map((item) => item.querySelector("span span")?.textContent);

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
  useSessionDialogsStore.setState(useSessionDialogsStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Slash commands in the message box (ADR 0042)", () => {
  it("lists Claude Code's commands for a slash, without the ones bound to its terminal", async () => {
    const { user, box } = await open();

    await user.type(box, "/");

    const list = await screen.findByRole("listbox", { name: "Slash commands" });
    expect(within(list).getAllByRole("option")).toHaveLength(4);
    expect(optionNames()).toEqual(["/compact", "/context", "/model", "/mattpocock-skills:tdd"]);
    expect(within(list).getByRole("option", { name: /\/compact/ })).toHaveTextContent(
      "Free up context by summarizing the conversation so far",
    );
    expect(within(list).getByRole("option", { name: /\/mattpocock-skills:tdd/ })).toHaveTextContent(
      "mattpocock-skills",
    );
  });

  it("filters as the person types, by an alias too", async () => {
    const { user, box } = await open();

    await user.type(box, "/tdd");

    expect(optionNames()).toEqual(["/mattpocock-skills:tdd"]);
    expect(box).toHaveAttribute("aria-activedescendant");
  });

  it("says when nothing matches, and sends what was typed", async () => {
    const { rust, user, box } = await open();

    await user.type(box, "/zzz");

    expect((await screen.findAllByText("No slash command matches")).length).toBeGreaterThan(0);
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(rust.sent()[0]?.payload).toMatchObject({ text: "/zzz" });
  });

  it("moves with the arrow keys and fills in the command with Tab", async () => {
    const { user, box } = await open();

    await user.type(box, "/c");
    expect(optionNames()).toEqual(["/compact", "/context"]);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /\/context/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{Tab}");

    expect(box).toHaveValue("/context ");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("sends a command that takes no arguments with Enter, and fills in one that does", async () => {
    const { rust, user, box } = await open();

    await user.type(box, "/cont{Enter}");
    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(rust.sent()[0]?.payload).toMatchObject({ text: "/context" });
  });

  it("fills in a command that takes arguments instead of sending it", async () => {
    const { rust, user, box } = await open();

    await user.type(box, "/comp{Enter}");

    expect(box).toHaveValue("/compact ");
    expect(rust.sent()).toHaveLength(0);
  });

  it("closes the list with Escape and keeps the text", async () => {
    const { user, box } = await open();

    await user.type(box, "/c");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box).toHaveValue("/c");
  });

  it("takes a command with a click", async () => {
    const { user, box } = await open();

    await user.type(box, "/comp");
    await user.click(await screen.findByRole("option", { name: /\/compact/ }));

    expect(box).toHaveValue("/compact ");
  });

  it("is not there for a Demo agent session", async () => {
    const { user, box } = await open("demo");

    await user.type(box, "/");

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("has no accessibility violations while it is open", async () => {
    const { user, box } = await open();

    await user.type(box, "/");
    await screen.findByRole("listbox");

    await expectNoAccessibilityViolations(document.body);
  });
});

describe("The slash commands that Arden Code runs itself (ADR 0042)", () => {
  it("/model sets the model like the menu does, and sends nothing", async () => {
    const { rust, user, box } = await open();

    await user.type(box, "/model Opus 4.6{Enter}");

    await waitFor(() => {
      expect(rust.callsTo("set_session_model")).toEqual([
        { id: "session-1", model: "claude-opus-4-6" },
      ]);
    });
    expect(await screen.findByRole("button", { name: "Model: Opus 4.6" })).toBeVisible();
    expect(rust.sent()).toHaveLength(0);
  });

  it("/model with a model Claude Code does not list says so and changes nothing", async () => {
    const { rust, user, box } = await open();

    await user.type(box, "/model gpt{Enter}");

    expect(await screen.findByText(/does not list a model called “gpt”/)).toBeInTheDocument();
    expect(rust.callsTo("set_session_model")).toEqual([]);
    expect(rust.sent()).toHaveLength(0);
  });

  it("/effort sets the effort, and auto leaves it to Claude Code", async () => {
    const { rust, user, box } = await open();

    await user.type(box, "/effort xhigh{Enter}");
    await waitFor(() => {
      expect(rust.callsTo("set_session_effort")).toEqual([
        { id: "session-1", effort: "extraHigh" },
      ]);
    });
    await user.type(box, "/effort auto{Enter}");
    await waitFor(() => {
      expect(rust.callsTo("set_session_effort")).toHaveLength(2);
    });

    expect(rust.callsTo("set_session_effort")[1]).toEqual({ id: "session-1", effort: null });
    expect(rust.sent()).toHaveLength(0);
  });

  it("/rename names the session, and with no name opens the Rename dialog", async () => {
    const { rust, user, box } = await open();

    await user.type(box, "/rename Better name{Enter}");
    await waitFor(() => {
      expect(rust.callsTo("rename_session")).toEqual([{ id: "session-1", name: "Better name" }]);
    });
    await user.type(box, "/rename{Enter}");

    const dialog = await screen.findByRole("dialog", { name: /Rename/ });
    await animationsDone(dialog);
    expect(dialog).toBeVisible();
    expect(rust.sent()).toHaveLength(0);
  });

  it("/clear starts a new session and sends nothing", async () => {
    const { rust, user, box } = await open();

    await user.type(box, "/clear{Enter}");

    await waitFor(() => {
      expect(rust.callsTo("create_session")).toHaveLength(1);
    });
    expect(rust.sent()).toHaveLength(0);
  });

  it("leaves the Ultrathink switch on for the next message, as a command takes no word", async () => {
    const { rust, user, box } = await open();
    await user.click(screen.getByRole("button", { name: /^Effort/ }));
    const menu = await screen.findByRole("menu");
    await animationsDone(menu);
    await user.click(within(menu).getByRole("menuitemcheckbox", { name: /Ultrathink/ }));
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Turn off Ultrathink" })).toBeVisible();

    await user.type(box, "/effort max{Enter}");
    await waitFor(() => {
      expect(rust.callsTo("set_session_effort")).toHaveLength(1);
    });
    await user.type(box, "Hello{Enter}");

    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(rust.sent()[0]?.payload).toMatchObject({ text: "Hello ultrathink" });
  });
});
