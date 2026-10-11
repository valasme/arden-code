import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { InstalledPlugin } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

function plugin(id: string, extra: Partial<InstalledPlugin> = {}): InstalledPlugin {
  const [name = id, marketplace = ""] = id.split("@");
  return {
    agent: "claude",
    id,
    name,
    marketplace,
    scope: "user",
    projectPath: null,
    version: "1.0.0",
    enabled: true,
    errors: [],
    ...extra,
  };
}

const installed: InstalledPlugin[] = [
  plugin("superpowers@claude-plugins-official", { version: "4.3.1" }),
  plugin("deploy@acme", {
    scope: "project",
    projectPath: "C:\\Work\\billing-api",
    enabled: false,
    errors: ["The hook script was not found"],
  }),
  plugin("notes@synced", { scope: "synced" }),
  plugin("policy@corp", { scope: "managed" }),
];

type Options = Parameters<typeof startSessionsRust>[0];

async function openApp(options: Options = {}, at = "/session/session-1") {
  const rust = startSessionsRust({
    sessions: [sessionNamed("session-1", "Fix the build")],
    installedPlugins: installed,
    ...options,
  });
  const user = userEvent.setup();
  const history = createMemoryHistory({ initialEntries: [at] });
  render(<App history={history} />);
  await screen.findByRole("main");
  return { rust, user, history };
}

const sidebar = () => screen.getByRole("complementary", { name: "Sidebar" });
/** The rows of the Installed list, without the lists of load errors inside them. */
const rows = () =>
  within(screen.getByRole("list", { name: "Installed plugins" }))
    .getAllByRole("listitem")
    .filter((item) => item.parentElement?.getAttribute("aria-label") === "Installed plugins");

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("The Plugins page (ADR 0053)", () => {
  it("opens from the sidebar's Plugins row, above Settings, with Back, its search and its tabs in the sidebar", async () => {
    const { user, history } = await openApp();
    const links = within(sidebar())
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links.indexOf("Plugins")).toBeLessThan(
      links.findIndex((text) => text?.startsWith("Settings")),
    );

    await user.click(within(sidebar()).getByRole("link", { name: "Plugins" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Plugins" })).toBeVisible();
    expect(
      screen.getByText("Plugins bring skills, slash commands and tools to your agents."),
    ).toBeVisible();
    expect(within(sidebar()).getByRole("searchbox", { name: "Search plugins" })).toBeVisible();
    expect(
      within(within(sidebar()).getByRole("navigation", { name: "Plugins tabs" })).getByRole(
        "link",
        { name: "Installed" },
      ),
    ).toBeVisible();

    await user.click(within(sidebar()).getByRole("link", { name: "Back" }));
    await waitFor(() => {
      expect(history.location.pathname).toBe("/session/session-1");
    });
  });

  it("opens from the command palette's Plugins command, which has no shortcut", async () => {
    const { user } = await openApp();

    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "Command palette" });
    const command = await within(palette).findByRole("option", { name: /^Plugins/ });
    expect(command.querySelector("kbd")).toBeNull();
    await user.click(command);

    expect(await screen.findByRole("heading", { level: 1, name: "Plugins" })).toBeVisible();
  });

  it("lists every installed plugin with its scope, project, version, state and load errors", async () => {
    await openApp({}, "/plugins/installed");

    await waitFor(() => {
      expect(rows()).toHaveLength(4);
    });
    const [superpowers, deploy, synced, managed] = rows();
    expect(superpowers).toHaveTextContent("superpowers");
    expect(superpowers).toHaveTextContent("claude-plugins-official");
    expect(superpowers).toHaveTextContent("For you, in every project");
    expect(superpowers).toHaveTextContent("4.3.1");
    expect(superpowers).toHaveTextContent("On");
    expect(deploy).toHaveTextContent("For everyone in this project");
    expect(deploy).toHaveTextContent("C:\\Work\\billing-api");
    expect(deploy).toHaveTextContent("Off");
    expect(deploy).toHaveTextContent("The hook script was not found");
    expect(synced).toHaveTextContent("From your claude.ai account");
    expect(managed).toHaveTextContent("From your organization");
  });

  it("filters the installed plugins by the sidebar's search", async () => {
    const { user } = await openApp({}, "/plugins/installed");
    await waitFor(() => {
      expect(rows()).toHaveLength(4);
    });

    await user.type(within(sidebar()).getByRole("searchbox", { name: "Search plugins" }), "dep");

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("deploy");
  });

  it("says when nothing is installed", async () => {
    await openApp({ installedPlugins: [] }, "/plugins/installed");

    expect(await screen.findByText("No plugins are installed.")).toBeVisible();
  });

  it("says how to install Claude Code when it is missing", async () => {
    await openApp({ failing: { installed_plugins: "ARD-AGT-007" } }, "/plugins/installed");

    expect(await screen.findByText("Claude Code is not installed.")).toBeVisible();
    expect(screen.getByText("ARD-AGT-007")).toBeVisible();
  });

  it("asks for claude update when Claude Code is older than plugins need", async () => {
    await openApp({ failing: { installed_plugins: "ARD-AGT-020" } }, "/plugins/installed");

    expect(await screen.findByText("Plugins need a newer Claude Code.")).toBeVisible();
    expect(screen.getByText("Run claude update in a terminal, then look again.")).toBeVisible();
    expect(screen.getByText("ARD-AGT-020")).toBeVisible();
  });

  it("has no accessibility violations", async () => {
    await openApp({}, "/plugins/installed");
    await waitFor(() => {
      expect(rows()).toHaveLength(4);
    });

    await expectNoAccessibilityViolations(document.body);
  });
});
