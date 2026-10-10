import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BotIcon, FlaskConicalIcon } from "lucide-react";

import type { AgentKind } from "@/ipc/bindings";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { drawingIn, drawingOf, drawingsIn } from "@/test/icons";

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
  it("names the session's agent, and says it is where the agent is chosen", () => {
    renderMenu("claude");

    const button = screen.getByRole("button", { name: "Agent: Claude" });
    expect(button).toHaveTextContent("Claude");
  });

  it("is an outlined button with an icon, so it reads as a control and not as a caption", () => {
    renderMenu("claude");

    const button = screen.getByRole("button", { name: "Agent: Claude" });
    expect(button).toHaveAttribute("data-variant", "outline");
    expect(button.querySelectorAll("svg")).toHaveLength(2);
  });

  it("draws Claude as a bot of Arden Code's own, not a vendor's logo, and the Demo agent as a flask", () => {
    const claude = renderMenu("claude");
    expect(drawingIn(screen.getByRole("button", { name: "Agent: Claude" }))).toBe(
      drawingOf(BotIcon),
    );
    claude.unmount();

    renderMenu("demo");
    expect(drawingIn(screen.getByRole("button", { name: "Agent: Demo agent" }))).toBe(
      drawingOf(FlaskConicalIcon),
    );
  });

  it("shows each agent's icon in the list too", async () => {
    const user = userEvent.setup();
    renderMenu("claude");

    await user.click(screen.getByRole("button", { name: "Agent: Claude" }));

    // The chosen item's check mark is an icon too.
    expect(drawingsIn(await screen.findByRole("menuitemradio", { name: "Claude" }))).toContain(
      drawingOf(BotIcon),
    );
    expect(drawingsIn(screen.getByRole("menuitemradio", { name: "Demo agent" }))).toContain(
      drawingOf(FlaskConicalIcon),
    );
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
    expect(items.map((item) => item.textContent)).toEqual(["Claude", "Demo agent"]);
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

  it("has no accessibility violations, closed or open", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu("claude");

    await expectNoAccessibilityViolations(container);
    await user.click(screen.getByRole("button", { name: "Agent: Claude" }));
    const menu = await screen.findByRole("menu");
    await animationsDone(menu);
    // The menu itself: Radix hides the page behind an open menu and keeps the focus in the menu.
    await expectNoAccessibilityViolations(menu);
  });
});
