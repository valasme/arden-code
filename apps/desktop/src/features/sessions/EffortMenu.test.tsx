import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Effort } from "@/ipc/bindings";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { EffortMenu } from "./EffortMenu";

import "@/styles/global.css";

function renderMenu(effort: Effort | null, disabled = false, ultrathink = false) {
  const chosen: (Effort | null)[] = [];
  const switched: boolean[] = [];
  const view = render(
    <EffortMenu
      effort={effort}
      disabled={disabled}
      ultrathink={ultrathink}
      onUltrathink={(on) => {
        switched.push(on);
      }}
      onChoose={(next) => {
        chosen.push(next);
      }}
    />,
  );
  return { chosen, switched, ...view };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name }));
  const menu = await screen.findByRole("menu");
  await animationsDone(menu);
  return menu;
}

describe("EffortMenu", () => {
  it("offers Default and the five efforts, and answers the pick", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu(null);

    const menu = await openMenu(user, "Effort: Default");
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.querySelector("[data-name]")?.textContent),
    ).toEqual(["Default", "Low", "Medium", "High", "Extra high", "Max"]);
    await user.click(within(menu).getByRole("menuitemradio", { name: /^Extra high/ }));

    expect(chosen).toEqual(["extraHigh"]);
  });

  it("answers null for Default, and names the chosen effort", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu("max");

    const menu = await openMenu(user, "Effort: Max");
    await user.click(within(menu).getByRole("menuitemradio", { name: /^Default/ }));

    expect(chosen).toEqual([null]);
  });

  it("ends with an Ultrathink switch that answers on and off, apart from the efforts", async () => {
    const user = userEvent.setup();
    const { switched } = renderMenu(null);

    const menu = await openMenu(user, "Effort: Default");
    const toggle = within(menu).getByRole("menuitemcheckbox", { name: /Ultrathink/ });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);

    expect(switched).toEqual([true]);
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(6);
  });

  it("shows the Ultrathink switch as on while the next message carries the word", async () => {
    const user = userEvent.setup();
    renderMenu(null, false, true);

    const menu = await openMenu(user, "Effort: Default");

    expect(within(menu).getByRole("menuitemcheckbox", { name: /Ultrathink/ })).toBeChecked();
  });

  it("cannot be opened while disabled", () => {
    renderMenu("low", true);

    expect(screen.getByRole("button", { name: "Effort: Low" })).toBeDisabled();
  });

  it("has no accessibility violations, closed or open", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu(null);

    await expectNoAccessibilityViolations(container);
    await expectNoAccessibilityViolations(await openMenu(user, "Effort: Default"));
  });
});
