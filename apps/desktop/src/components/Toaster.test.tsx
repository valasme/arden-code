import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { page } from "vitest/browser";

import { expectNoAccessibilityViolations } from "@/test/axe";

import { Toaster } from "./Toaster";

import "@/styles/global.css";

const root = document.documentElement;

beforeEach(async () => {
  // Below 600px wide, Sonner stretches toasts across the window; the app's window is wider.
  await page.viewport(1280, 800);
});

afterEach(() => {
  root.style.removeProperty("--zoom");
  root.removeAttribute("data-motion");
});

/** The toast that shows a message, once it is on screen. */
async function shown(message: string) {
  const text = await screen.findByText(message);
  const item = text.closest<HTMLElement>("[data-sonner-toast]");
  if (!item) throw new Error(`"${message}" is not in a toast`);
  return item;
}

/** What a color, such as a theme token, computes to here. */
function computed(color: string) {
  const sample = document.createElement("span");
  sample.style.color = color;
  document.body.append(sample);
  const value = getComputedStyle(sample).color;
  sample.remove();
  return value;
}

/** The color of a toast's icon. */
async function iconColor(message: string) {
  const icon = (await shown(message)).querySelector("[data-icon] svg");
  if (!icon) throw new Error(`the toast "${message}" has no icon`);
  return getComputedStyle(icon).color;
}

/** The longest transition of an element, in milliseconds. */
function longestTransition(element: Element) {
  return Math.max(
    ...getComputedStyle(element)
      .transitionDuration.split(",")
      .map((duration) => Number.parseFloat(duration) * (duration.trim().endsWith("ms") ? 1 : 1000)),
  );
}

describe("Toaster", () => {
  it("draws a toast like the app's other floating surfaces: its font, the popover colors, a 1px border and square corners", async () => {
    render(<Toaster />);

    toast.success("Settings exported");

    const style = getComputedStyle(await shown("Settings exported"));
    expect(style.fontFamily).toMatch(/^"Inter Variable"/);
    expect(style.backgroundColor).toBe(computed("var(--popover)"));
    expect(style.color).toBe(computed("var(--popover-foreground)"));
    expect(style.borderTopWidth).toBe("1px");
    expect(style.borderTopColor).toBe(computed("var(--border)"));
    expect(style.borderTopLeftRadius).toBe("0px");
  });

  it("marks an error with the destructive color, and leaves the other kinds neutral", async () => {
    render(<Toaster />);

    toast.error("Could not save the file");
    toast.success("Saved the file");

    expect(await iconColor("Could not save the file")).toBe(computed("var(--destructive)"));
    expect(await iconColor("Saved the file")).toBe(computed("var(--popover-foreground)"));
  });

  it("lets every toast be closed early, with a labeled button inside it", async () => {
    const user = userEvent.setup();
    render(<Toaster />);

    toast.info("Checked for updates");

    const item = await shown("Checked for updates");
    const close = within(item).getByRole("button", { name: "Close notice" });
    const box = item.getBoundingClientRect();
    const button = close.getBoundingClientRect();
    expect(button.top).toBeGreaterThanOrEqual(box.top);
    expect(button.right).toBeLessThanOrEqual(box.right);

    await user.click(close);

    await waitFor(() => {
      expect(screen.queryByText("Checked for updates")).toBeNull();
    });
  });

  it("puts an action under the text, drawn like the app's outline buttons", async () => {
    render(<Toaster />);

    toast.error("Something went wrong", {
      description: "The disk is full.",
      action: { label: "Copy details", onClick: () => {} },
    });

    const item = await shown("Something went wrong");
    const action = within(item).getByRole("button", { name: "Copy details" });
    const description = within(item).getByText("The disk is full.");
    expect(action.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      description.getBoundingClientRect().bottom,
    );
    expect(getComputedStyle(action).borderTopWidth).toBe("1px");
    expect(getComputedStyle(action).borderTopLeftRadius).toBe("0px");
  });

  it("grows with the zoom", async () => {
    render(<Toaster />);

    toast.success("Copied the system info");

    const item = await shown("Copied the system info");
    const width = item.getBoundingClientRect().width;
    root.style.setProperty("--zoom", "1.5");
    await waitFor(() => {
      expect(item.getBoundingClientRect().width).toBeCloseTo(width * 1.5, 0);
    });
  });

  it("moves for 160ms at most, and not at all with reduced motion", async () => {
    render(<Toaster />);

    toast.success("Sent a test notification");

    const item = await shown("Sent a test notification");
    expect(longestTransition(item)).toBeGreaterThan(0);
    expect(longestTransition(item)).toBeLessThanOrEqual(160);
    root.dataset["motion"] = "reduce";
    expect(longestTransition(item)).toBeLessThan(1);
  });

  it("names its region in the app's words, with the shortcut that reaches it", async () => {
    render(<Toaster />);

    toast.success("Imported the settings");

    await shown("Imported the settings");
    expect(screen.getByRole("region", { name: "Notices (Alt+T)" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<Toaster />);

    toast.error("Could not export", {
      description: "The folder is read-only.",
      action: { label: "Copy details", onClick: () => {} },
    });

    await shown("Could not export");
    await expectNoAccessibilityViolations(container);
  });
});
