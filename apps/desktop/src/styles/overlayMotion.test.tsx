import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";

import "@/styles/global.css";

const root = document.documentElement;

afterEach(() => {
  root.removeAttribute("data-motion");
});

/** How long an element's animation runs, in milliseconds. */
function animationMs(element: Element) {
  const duration = getComputedStyle(element).animationDuration;
  return Number.parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000);
}

/** How long an element's transitions run, in milliseconds: an overlay moves by its animation. */
function transitionMs(element: Element) {
  const durations = getComputedStyle(element).transitionDuration.split(",");
  return Math.max(...durations.map((duration) => Number.parseFloat(duration) * 1000));
}

function slot(name: string) {
  const element = document.querySelector(`[data-slot=${name}]`);
  if (!element) throw new Error(`nothing is drawn as ${name}`);
  return element;
}

const dialog = (open: boolean) => (
  <Dialog open={open}>
    <DialogContent>
      <DialogTitle>Reset settings?</DialogTitle>
      <DialogDescription>Every setting goes back to its default.</DialogDescription>
    </DialogContent>
  </Dialog>
);

const confirmation = (open: boolean) => (
  <ConfirmDialog
    open={open}
    onOpenChange={() => {}}
    title="Delete the session?"
    description="It cannot be brought back."
    confirmLabel="Delete"
    onConfirm={() => {}}
  />
);

const menu = (open: boolean, subOpen = false) => (
  <DropdownMenu open={open}>
    <DropdownMenuTrigger>Session actions</DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem>Rename</DropdownMenuItem>
      <DropdownMenuSub open={subOpen}>
        <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem>Playground</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>
);

const popover = (open: boolean) => (
  <Popover open={open}>
    <PopoverTrigger>Context window</PopoverTrigger>
    <PopoverContent>42% of the context window is used.</PopoverContent>
  </Popover>
);

const tooltip = (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger>New session</TooltipTrigger>
      <TooltipContent>Ctrl+N</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

describe("An overlay", () => {
  it("opens in 160ms and closes in 120ms with no transition, and does not move with reduced motion: a dialog and its scrim", async () => {
    const { rerender } = render(dialog(true));
    await screen.findByRole("dialog", { name: "Reset settings?" });
    await animationsDone(document.body);
    await expectNoAccessibilityViolations(document.body);

    expect(animationMs(slot("dialog-content"))).toBe(160);
    expect(transitionMs(slot("dialog-content"))).toBe(0);
    expect(animationMs(slot("dialog-overlay"))).toBe(160);
    expect(transitionMs(slot("dialog-overlay"))).toBe(0);

    rerender(dialog(false));

    expect(animationMs(slot("dialog-content"))).toBe(120);
    expect(animationMs(slot("dialog-overlay"))).toBe(120);

    root.dataset["motion"] = "reduce";
    expect(animationMs(slot("dialog-content"))).toBeLessThan(1);
    expect(animationMs(slot("dialog-overlay"))).toBeLessThan(1);
  });

  it("opens in 160ms and closes in 120ms with no transition, and does not move with reduced motion: a confirmation and its scrim", async () => {
    const { rerender } = render(confirmation(true));
    await screen.findByRole("alertdialog", { name: "Delete the session?" });
    await animationsDone(document.body);
    await expectNoAccessibilityViolations(document.body);

    expect(animationMs(slot("confirm-dialog-content"))).toBe(160);
    expect(transitionMs(slot("confirm-dialog-content"))).toBe(0);
    expect(animationMs(slot("confirm-dialog-overlay"))).toBe(160);
    expect(transitionMs(slot("confirm-dialog-overlay"))).toBe(0);

    rerender(confirmation(false));

    expect(animationMs(slot("confirm-dialog-content"))).toBe(120);
    expect(animationMs(slot("confirm-dialog-overlay"))).toBe(120);

    root.dataset["motion"] = "reduce";
    expect(animationMs(slot("confirm-dialog-content"))).toBeLessThan(1);
    expect(animationMs(slot("confirm-dialog-overlay"))).toBeLessThan(1);
  });

  it("opens in 160ms and closes in 120ms with no transition, and does not move with reduced motion: a menu, as context menus are", async () => {
    const { rerender } = render(menu(true));
    await screen.findByRole("menu");

    expect(animationMs(slot("dropdown-menu-content"))).toBe(160);
    expect(transitionMs(slot("dropdown-menu-content"))).toBe(0);

    rerender(menu(false));

    expect(animationMs(slot("dropdown-menu-content"))).toBe(120);

    root.dataset["motion"] = "reduce";
    expect(animationMs(slot("dropdown-menu-content"))).toBeLessThan(1);
  });

  it("opens in 160ms and closes in 120ms with no transition, and does not move with reduced motion: a submenu", async () => {
    const { rerender } = render(menu(true, true));
    await screen.findByRole("menuitem", { name: "Playground" });

    expect(animationMs(slot("dropdown-menu-sub-content"))).toBe(160);
    expect(transitionMs(slot("dropdown-menu-sub-content"))).toBe(0);

    rerender(menu(true, false));

    expect(animationMs(slot("dropdown-menu-sub-content"))).toBe(120);

    root.dataset["motion"] = "reduce";
    expect(animationMs(slot("dropdown-menu-sub-content"))).toBeLessThan(1);
  });

  it("opens in 160ms and closes in 120ms with no transition, and does not move with reduced motion: a popover", async () => {
    const { rerender } = render(popover(true));
    await screen.findByText("42% of the context window is used.");

    expect(animationMs(slot("popover-content"))).toBe(160);
    expect(transitionMs(slot("popover-content"))).toBe(0);

    rerender(popover(false));

    expect(animationMs(slot("popover-content"))).toBe(120);

    root.dataset["motion"] = "reduce";
    expect(animationMs(slot("popover-content"))).toBeLessThan(1);
  });

  it("opens in 160ms and closes in 120ms with no transition, and does not move with reduced motion: a tooltip", async () => {
    const user = userEvent.setup();
    render(tooltip);

    await user.hover(screen.getByRole("button", { name: "New session" }));
    await screen.findByRole("tooltip");

    expect(animationMs(slot("tooltip-content"))).toBe(160);
    expect(transitionMs(slot("tooltip-content"))).toBe(0);

    await user.unhover(screen.getByRole("button", { name: "New session" }));

    expect(animationMs(slot("tooltip-content"))).toBe(120);

    root.dataset["motion"] = "reduce";
    expect(animationMs(slot("tooltip-content"))).toBeLessThan(1);
  });
});
