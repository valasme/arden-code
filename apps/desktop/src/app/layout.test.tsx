import { createMemoryHistory } from "@tanstack/react-router";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import { useLayoutStore } from "@/state/layout";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { App } from "./App";

import "@/styles/global.css";

function renderApp(entries = ["/"], initialIndex = entries.length - 1) {
  mockIPC((command) => {
    if (command === "app_info") return { name: "Arden Code", version: "0.1.0" };
    throw new Error(`unexpected command: ${command}`);
  });
  return render(<App history={createMemoryHistory({ initialEntries: entries, initialIndex })} />);
}

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
});

const width = (element: HTMLElement) => element.getBoundingClientRect().width;
const openSessionView = () =>
  screen.findByRole("heading", { name: "What should the Demo agent work on?" });
const openGeneralSettings = () => screen.findByRole("heading", { level: 1, name: "General" });

/** Presses and releases a mouse button on the page, and returns the event so its handling can be checked. */
function press(button: number) {
  const event = new MouseEvent("mouseup", { button, bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
}

describe("the window's regions", () => {
  it("shows the title bar, sidebar, session view and status bar, with the inspector hidden", async () => {
    renderApp();

    expect(await screen.findByRole("banner")).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeVisible();
    expect(screen.getByRole("main")).toBeVisible();
    expect(screen.getByRole("contentinfo")).toBeVisible();
    expect(screen.queryByRole("complementary", { name: "Inspector" })).toBeNull();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderApp();
    await screen.findByRole("main");

    await expectNoAccessibilityViolations(container);
  });

  it("opens the sidebar with New session and closes it with Settings, each showing its shortcut", async () => {
    renderApp();
    const sidebar = await screen.findByRole("complementary", { name: "Sidebar" });
    const controls = [...sidebar.querySelectorAll<HTMLElement>("button, a[href]")];

    const first = controls[0];
    const last = controls.at(-1);
    expect(first).toHaveAccessibleName("New session");
    expect(first).toHaveTextContent("Ctrl+N");
    expect(last).toHaveAccessibleName("Settings");
    expect(last).toHaveTextContent("Ctrl+,");
    // A row, not an outlined button.
    expect(getComputedStyle(first ?? sidebar).borderTopWidth).toBe("0px");
  });

  it("collapses and expands the sidebar", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.click(screen.getByRole("button", { name: "Hide sidebar" }));
    expect(screen.queryByRole("complementary", { name: "Sidebar" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show sidebar" }));
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeVisible();
  });

  it("shows and hides the inspector", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.click(screen.getByRole("button", { name: "Show inspector" }));
    expect(screen.getByRole("complementary", { name: "Inspector" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Hide inspector" }));
    expect(screen.queryByRole("complementary", { name: "Inspector" })).toBeNull();
  });

  it("resizes the sidebar with the keyboard", async () => {
    const user = userEvent.setup();
    renderApp();
    const sidebar = await screen.findByRole("complementary", { name: "Sidebar" });
    const separator = screen.getAllByRole("separator")[0];
    if (!separator) throw new Error("no separator between the sidebar and the session view");
    const before = width(sidebar);

    separator.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}");

    await waitFor(() => {
      expect(width(sidebar)).toBeGreaterThan(before);
    });
  });

  it("keeps the sidebar collapsed state in sync when it is dragged shut", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("complementary", { name: "Sidebar" });
    const separator = screen.getAllByRole("separator")[0];
    if (!separator) throw new Error("no separator between the sidebar and the session view");

    separator.focus();
    // Far more than the sidebar's width, so it shrinks past its minimum and collapses.
    await user.keyboard("{ArrowLeft>30/}");

    await waitFor(() => {
      expect(useLayoutStore.getState().sidebarOpen).toBe(false);
    });
    expect(screen.getByRole("button", { name: "Show sidebar" })).toBeVisible();
  });
});

describe("the routes", () => {
  it.each([
    ["general", "General"],
    ["appearance", "Appearance"],
    ["keyboard", "Keyboard"],
    ["notifications", "Notifications"],
    ["agents", "Agents"],
    ["advanced", "Advanced"],
    ["about", "About"],
  ])("has a page for the %s settings tab", async (tab, title) => {
    renderApp([`/settings/${tab}`]);

    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeVisible();
  });

  it("opens the first settings tab for /settings", async () => {
    renderApp(["/settings"]);

    expect(await screen.findByRole("heading", { level: 1, name: "General" })).toBeVisible();
  });

  it("says so when a page does not exist", async () => {
    renderApp(["/settings/nonsense"]);

    expect(await screen.findByText("This page does not exist.")).toBeVisible();
  });

  it("has the design system page", async () => {
    renderApp(["/dev/design-system"]);

    expect(await screen.findByRole("heading", { level: 1, name: "Design system" })).toBeVisible();
  });

  it("links from the sidebar to the settings", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("link", { name: "Settings" }));

    expect(await screen.findByRole("heading", { level: 1, name: "General" })).toBeVisible();
  });
});

describe("going back and forward", () => {
  it("goes back and forward with Alt+Left and Alt+Right", async () => {
    const user = userEvent.setup();
    renderApp(["/", "/settings/general"]);
    await openGeneralSettings();

    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(await openSessionView()).toBeVisible();

    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(await openGeneralSettings()).toBeVisible();
  });

  it("goes back and forward with the mouse side buttons, and keeps the browser from doing it too", async () => {
    renderApp(["/", "/settings/general"]);
    await openGeneralSettings();

    expect(press(3).defaultPrevented).toBe(true);
    expect(await openSessionView()).toBeVisible();

    expect(press(4).defaultPrevented).toBe(true);
    expect(await openGeneralSettings()).toBeVisible();
  });

  it("leaves other mouse buttons alone", () => {
    renderApp();
    const event = new MouseEvent("mouseup", { button: 0, bubbles: true, cancelable: true });

    document.body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
