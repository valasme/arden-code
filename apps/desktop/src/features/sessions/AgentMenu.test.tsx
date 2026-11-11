import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlaskConicalIcon } from "lucide-react";

import type { AgentKind } from "@/ipc/bindings";
import { drawingIn, drawingOf, drawingsIn } from "@/test/icons";

import claudeSymbol from "../../../../../brand/reference/agents/claude-symbol.svg";
import { AgentMenu } from "./AgentMenu";

import "@/styles/global.css";

function renderMenu(agent: AgentKind, unavailable: AgentKind[] = []) {
  const chosen: AgentKind[] = [];
  const view = render(
    <AgentMenu
      agent={agent}
      unavailable={unavailable}
      onChoose={(next) => {
        chosen.push(next);
      }}
    />,
  );
  return { chosen, ...view };
}

describe("AgentMenu", () => {
  it("offers Codex as a distinct agent and passes that choice to the session", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu("demo");
    await user.click(screen.getByRole("button", { name: "Agent: Demo agent" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Codex" }));
    expect(chosen).toEqual(["codex"]);
  });

  it("names the session's agent, and says it is where the agent is chosen", () => {
    renderMenu("claude");

    const button = screen.getByRole("button", { name: "Agent: Claude" });
    expect(button).toHaveTextContent("Claude");
  });

  it("is a button with an icon and a chevron, so it reads as a control and not as a caption", () => {
    renderMenu("claude");

    const button = screen.getByRole("button", { name: "Agent: Claude" });
    expect(button.querySelectorAll("svg")).toHaveLength(2);
  });

  it("draws the supplied Claude artwork and keeps the Demo agent's flask", () => {
    const claude = renderMenu("claude");
    const button = screen.getByRole("button", { name: "Agent: Claude" });
    expect(button.querySelector("svg image")).toHaveAttribute("href", claudeSymbol);
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    claude.unmount();

    renderMenu("demo");
    expect(drawingIn(screen.getByRole("button", { name: "Agent: Demo agent" }))).toBe(
      drawingOf(FlaskConicalIcon),
    );
  });

  it("shows each agent's icon in the list too", async () => {
    const flask = drawingOf(FlaskConicalIcon);
    const user = userEvent.setup();
    renderMenu("claude");

    await user.click(screen.getByRole("button", { name: "Agent: Claude" }));

    const claude = await screen.findByRole("menuitemradio", { name: "Claude" });
    expect(claude.querySelector("svg image")).toHaveAttribute("href", claudeSymbol);
    expect(drawingsIn(screen.getByRole("menuitemradio", { name: "Demo agent" }))).toContain(flask);
  });

  it("offers an agent whose agent CLI is not installed only as disabled, saying so", async () => {
    const user = userEvent.setup();
    renderMenu("demo", ["claude"]);

    await user.click(screen.getByRole("button", { name: "Agent: Demo agent" }));

    const claude = await screen.findByRole("menuitemradio", { name: /Claude/ });
    expect(claude).toHaveAttribute("aria-disabled", "true");
    expect(claude).toHaveTextContent("Not installed");
  });

  it("lists the agents with the chosen one checked, and answers the one picked", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu("claude");

    await user.click(screen.getByRole("button", { name: "Agent: Claude" }));
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual(["Claude", "Codex", "Demo agent"]);
    expect(screen.getByRole("menuitemradio", { name: "Claude" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Demo agent" }));

    expect(chosen).toEqual(["demo"]);
  });

  it("works by keyboard", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu("demo");

    screen.getByRole("button", { name: "Agent: Demo agent" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(chosen.length).toBe(1);
  });
});
