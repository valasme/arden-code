import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Model } from "@/ipc/bindings";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { ModelMenu } from "./ModelMenu";

import "@/styles/global.css";

function renderMenu(model: Model | null, disabled = false) {
  const chosen: (Model | null)[] = [];
  const view = render(
    <ModelMenu
      model={model}
      disabled={disabled}
      onChoose={(next) => {
        chosen.push(next);
      }}
    />,
  );
  return { chosen, ...view };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name }));
  const menu = await screen.findByRole("menu");
  await animationsDone(menu);
  return menu;
}

describe("ModelMenu", () => {
  it("names the chosen model, or Default for Claude Code's own setting", () => {
    renderMenu(null);
    expect(screen.getByRole("button", { name: "Model: Default" })).toHaveTextContent("Default");
  });

  it("offers Default and the four models, with the chosen one checked, and answers the pick", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu("opus");

    const menu = await openMenu(user, "Model: Opus");
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.querySelector("[data-name]")?.textContent)).toEqual([
      "Default",
      "Fable",
      "Opus",
      "Sonnet",
      "Haiku",
    ]);
    expect(within(menu).getByRole("menuitemradio", { name: /^Opus/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(items[0]).toHaveTextContent("Claude Code's own setting");
    await user.click(within(menu).getByRole("menuitemradio", { name: /^Sonnet/ }));
    expect(chosen).toEqual(["sonnet"]);
  });

  it("answers null for Default", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu("haiku");

    const menu = await openMenu(user, "Model: Haiku");
    await user.click(within(menu).getByRole("menuitemradio", { name: /^Default/ }));

    expect(chosen).toEqual([null]);
  });

  it("cannot be opened while disabled, as while a reply runs", () => {
    renderMenu("opus", true);

    expect(screen.getByRole("button", { name: "Model: Opus" })).toBeDisabled();
  });

  it("has no accessibility violations, closed or open", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu(null);

    await expectNoAccessibilityViolations(container);
    await expectNoAccessibilityViolations(await openMenu(user, "Model: Default"));
  });
});
