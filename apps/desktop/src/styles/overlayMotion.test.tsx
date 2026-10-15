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

/** How an element is drawn `ms` into its animation: where it is, how large, and how opaque. */
function frame(element: Element, ms: number) {
  const animation = element.getAnimations().find((each) => each instanceof CSSAnimation);
  if (!animation) throw new Error("the element is not moving");
  animation.pause();
  animation.currentTime = ms;
  const style = getComputedStyle(element);
  const matrix = new DOMMatrix(style.transform);
  return { x: matrix.m41, y: matrix.m42, scale: matrix.a, opacity: Number(style.opacity) };
}

/** Where an overlay starts: 0.25rem (4px) back toward what it opened from. */
function startFor(element: Element) {
  const side = element.getAttribute("data-side");
  const offsets: Record<string, { x: number; y: number }> = {
    bottom: { x: 0, y: -4 },
    top: { x: 0, y: 4 },
    left: { x: 4, y: 0 },
    right: { x: -4, y: 0 },
  };
  const offset = side ? offsets[side] : undefined;
  if (!offset) throw new Error(`the overlay opened on no side (${side})`);
  return offset;
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

/** Opening on Fluent 2's decelerate-mid curve, from transparent at `start`. */
function expectOpening(element: Element, start: { x: number; y: number; scale: number }) {
  expect(getComputedStyle(element).animationTimingFunction).toBe("cubic-bezier(0, 0, 0, 1)");
  expect(frame(element, 0)).toEqual({ ...start, opacity: 0 });
}

/** Closing on Fluent 2's accelerate-min curve, as a fade: nothing moves or changes size. */
function expectFadingOut(element: Element) {
  expect(getComputedStyle(element).animationTimingFunction).toBe("cubic-bezier(0.8, 0, 0.78, 1)");
  const closing = frame(element, 60);
  expect(closing).toMatchObject({ x: 0, y: 0, scale: 1 });
  expect(closing.opacity).toBeGreaterThan(0);
  expect(closing.opacity).toBeLessThan(1);
}

describe("How an overlay moves", () => {
  it("a menu slides in from its side as it fades in, and only fades out", async () => {
    const { rerender } = render(menu(true));
    await screen.findByRole("menu");
    const content = slot("dropdown-menu-content");

    expectOpening(content, { ...startFor(content), scale: 1 });
    rerender(menu(false));
    expectFadingOut(content);
  });

  it("a submenu slides in from its side as it fades in, and only fades out", async () => {
    const { rerender } = render(menu(true, true));
    await screen.findByRole("menuitem", { name: "Playground" });
    const content = slot("dropdown-menu-sub-content");

    expectOpening(content, { ...startFor(content), scale: 1 });
    rerender(menu(true, false));
    expectFadingOut(content);
  });

  it("a popover slides in from its side as it fades in, and only fades out", async () => {
    const { rerender } = render(popover(true));
    await screen.findByText("42% of the context window is used.");
    const content = slot("popover-content");

    expectOpening(content, { ...startFor(content), scale: 1 });
    rerender(popover(false));
    expectFadingOut(content);
  });

  it("a tooltip slides in from its side as it fades in, and only fades out", async () => {
    const user = userEvent.setup();
    render(tooltip);
    await user.hover(screen.getByRole("button", { name: "New session" }));
    await screen.findByRole("tooltip");
    const content = slot("tooltip-content");

    expectOpening(content, { ...startFor(content), scale: 1 });
    await user.unhover(screen.getByRole("button", { name: "New session" }));
    expectFadingOut(content);
  });
});

describe("How a dialog moves", () => {
  it("settles from 98% as it fades in over a fading scrim, and only fades out", async () => {
    const { rerender } = render(dialog(true));
    await screen.findByRole("dialog", { name: "Reset settings?" });
    const content = slot("dialog-content");
    const scrim = slot("dialog-overlay");

    expectOpening(content, { x: 0, y: 0, scale: 0.98 });
    expectOpening(scrim, { x: 0, y: 0, scale: 1 });
    rerender(dialog(false));
    expectFadingOut(content);
    expectFadingOut(scrim);
  });

  it("a confirmation moves as a dialog does", async () => {
    const { rerender } = render(confirmation(true));
    await screen.findByRole("alertdialog", { name: "Delete the session?" });
    const content = slot("confirm-dialog-content");
    const scrim = slot("confirm-dialog-overlay");

    expectOpening(content, { x: 0, y: 0, scale: 0.98 });
    expectOpening(scrim, { x: 0, y: 0, scale: 1 });
    rerender(confirmation(false));
    expectFadingOut(content);
    expectFadingOut(scrim);
  });
});
