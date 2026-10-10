import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PermissionMode } from "@/ipc/bindings";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { PermissionModeMenu } from "./PermissionModeMenu";

import "@/styles/global.css";

function renderMenu(mode: PermissionMode, bypassAllowed = false) {
  const chosen: PermissionMode[] = [];
  const view = render(
    <PermissionModeMenu
      mode={mode}
      bypassAllowed={bypassAllowed}
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

describe("PermissionModeMenu", () => {
  it("lists the five modes in order, each saying what it does, and answers the pick", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu("manual");

    const menu = await openMenu(user, "Permission mode: Manual");
    expect(within(menu).getByText("Permission mode")).toBeVisible();
    const items = within(menu).getAllByRole("menuitemradio");
    expect(items.map((item) => item.querySelector("[data-name]")?.textContent)).toEqual([
      "Manual",
      "Accept edits",
      "Plan",
      "Auto",
      "Bypass permissions",
    ]);
    expect(items[0]).toHaveTextContent("Asks before it edits files or runs commands");
    expect(items[0]).toBeChecked();
    await user.click(within(menu).getByRole("menuitemradio", { name: /^Plan/ }));

    expect(chosen).toEqual(["plan"]);
  });

  it("chooses a mode by its digit while the menu is open", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu("manual");

    const menu = await openMenu(user, "Permission mode: Manual");
    expect(within(menu).getByRole("menuitemradio", { name: /^Auto/ })).toHaveTextContent("4");
    await user.keyboard("2");

    expect(chosen).toEqual(["acceptEdits"]);
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
  });

  it("lists Bypass permissions as unavailable until Settings allows it", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu("plan");

    const menu = await openMenu(user, "Permission mode: Plan");
    const bypass = within(menu).getByRole("menuitemradio", { name: /^Bypass permissions/ });
    expect(bypass).toHaveAttribute("aria-disabled", "true");
    expect(bypass).toHaveTextContent("Turn on in Settings → Agents");
    await user.keyboard("5");

    expect(chosen).toEqual([]);
  });

  it("offers Bypass permissions once Settings allows it, saying it never asks", async () => {
    const user = userEvent.setup();
    const { chosen } = renderMenu("manual", true);

    const menu = await openMenu(user, "Permission mode: Manual");
    const bypass = within(menu).getByRole("menuitemradio", { name: /^Bypass permissions/ });
    expect(bypass).not.toHaveAttribute("aria-disabled");
    expect(bypass).toHaveTextContent("Runs every action without asking");
    await user.keyboard("5");

    expect(chosen).toEqual(["bypassPermissions"]);
  });

  it("takes the destructive color while the session is in Bypass permissions", () => {
    renderMenu("bypassPermissions", true);
    const destructive = document.createElement("span");
    destructive.className = "text-destructive";
    document.body.append(destructive);

    const button = screen.getByRole("button", { name: "Permission mode: Bypass permissions" });
    expect(getComputedStyle(button).color).toBe(getComputedStyle(destructive).color);
    destructive.remove();
  });

  it("names the mode the session is in, and has no accessibility violations, closed or open", async () => {
    const user = userEvent.setup();
    const { container } = renderMenu("acceptEdits");

    await expectNoAccessibilityViolations(container);
    await expectNoAccessibilityViolations(await openMenu(user, "Permission mode: Accept edits"));
  });
});
