import { createMemoryHistory } from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";
import { z } from "zod";

import type { AvailablePlugin, InstalledPlugin, Marketplace } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { folderProject, sessionNamed, startSessionsRust } from "@/test/sessions";

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

  it("says how to install Claude Code when it is missing, in this page's words", async () => {
    await openApp({ failing: { installed_plugins: "ARD-AGT-007" } }, "/plugins/installed");

    expect(await screen.findByText("Claude Code is not installed.")).toBeVisible();
    expect(
      screen.getByText("Install Claude Code (Settings → Agents shows how), then look again."),
    ).toBeVisible();
    expect(screen.queryByText(/send your message/)).toBeNull();
    expect(screen.getByText("ARD-AGT-007")).toBeVisible();
  });

  it("says when Arden Code ran nothing, without words of Claude Code's", async () => {
    await openApp({ failing: { installed_plugins: "ARD-AGT-024" } }, "/plugins/installed");

    expect(await screen.findByText("Arden Code did not run this.")).toBeVisible();
    expect(screen.getByText("ARD-AGT-024")).toBeVisible();
  });

  it("asks for claude update when Claude Code is older than plugins need", async () => {
    await openApp({ failing: { installed_plugins: "ARD-AGT-020" } }, "/plugins/installed");

    expect(await screen.findByText("Plugins need a newer Claude Code.")).toBeVisible();
    expect(screen.getByText("Run claude update in a terminal, then look again.")).toBeVisible();
    expect(screen.getByText("ARD-AGT-020")).toBeVisible();
  });

  it("has no accessibility violations on Installed", async () => {
    await openApp({}, "/plugins/installed");
    await waitFor(() => {
      expect(rows()).toHaveLength(4);
    });

    await expectNoAccessibilityViolations(document.body);
  });
});

function offered(id: string, extra: Partial<AvailablePlugin> = {}): AvailablePlugin {
  const [name = id, marketplace = ""] = id.split("@");
  return {
    agent: "claude",
    id,
    name,
    marketplace,
    description: `What ${name} does.`,
    version: "1.0.0",
    installs: null,
    source: `./plugins/${name}`,
    ...extra,
  };
}

const catalog: AvailablePlugin[] = [
  offered("zebra-docs@claude-plugins-official", { description: "Writes docs." }),
  offered("github@claude-plugins-official", {
    installs: 96_120,
    description: "Official GitHub MCP server: issues and pull requests.",
    source: "https://github.com/anthropics/claude-plugins-official.git · external_plugins/github",
    version: "1.2.0",
  }),
  offered("superpowers@claude-plugins-official", { installs: 182_400 }),
  offered("alpha-tools@acme", { description: "Deploys to staging." }),
];

const offeredRows = () =>
  within(screen.getByRole("listbox", { name: "Plugins" })).getAllByRole("option");

describe("Discover (ADR 0053)", () => {
  it("is the first tab, where the page opens", async () => {
    const { user } = await openApp({ pluginCatalog: catalog });

    await user.click(within(sidebar()).getByRole("link", { name: "Plugins" }));

    const tabs = within(within(sidebar()).getByRole("navigation", { name: "Plugins tabs" }))
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(tabs).toEqual(["Discover", "Installed", "Marketplaces"]);
    expect(await screen.findByRole("listbox", { name: "Plugins" })).toBeVisible();
  });

  it("lists the most installed first, then by name", async () => {
    await openApp({ pluginCatalog: catalog }, "/plugins/discover");

    await waitFor(() => {
      expect(
        offeredRows().map((row) => row.querySelector("[data-plugin-name]")?.textContent),
      ).toEqual(["superpowers", "github", "alpha-tools", "zebra-docs"]);
    });
  });

  it("searches names and descriptions from the sidebar", async () => {
    const { user } = await openApp({ pluginCatalog: catalog }, "/plugins/discover");
    await screen.findAllByRole("option");

    await user.type(
      within(sidebar()).getByRole("searchbox", { name: "Search plugins" }),
      "pull req",
    );

    expect(offeredRows()).toHaveLength(1);
    expect(offeredRows()[0]).toHaveTextContent("github");
  });

  it("shows a plugin's details with the warning about what it can run", async () => {
    const { user } = await openApp({ pluginCatalog: catalog }, "/plugins/discover");

    await user.click(await screen.findByRole("option", { name: /^github/ }));

    const pane = screen.getByRole("region", { name: "github" });
    expect(pane).toHaveTextContent("Official GitHub MCP server: issues and pull requests.");
    expect(pane).toHaveTextContent("claude-plugins-official");
    expect(pane).toHaveTextContent("1.2.0");
    expect(pane).toHaveTextContent("96,120");
    expect(pane).toHaveTextContent(
      "https://github.com/anthropics/claude-plugins-official.git · external_plugins/github",
    );
    expect(pane).toHaveTextContent(
      "A plugin can run programs on this computer through its hooks and servers. Install only plugins you trust.",
    );
  });

  it("moves through the list with the arrow keys", async () => {
    const { user } = await openApp({ pluginCatalog: catalog }, "/plugins/discover");
    const list = await screen.findByRole("listbox", { name: "Plugins" });
    await screen.findAllByRole("option");

    list.focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("option", { name: /^github/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("region", { name: "github" })).toBeVisible();
  });

  it("reads the catalog once in a run, and again on Refresh", async () => {
    const { rust, user } = await openApp({ pluginCatalog: catalog }, "/plugins/discover");
    await screen.findAllByRole("option");
    await user.click(within(sidebar()).getByRole("link", { name: "Installed" }));
    await user.click(within(sidebar()).getByRole("link", { name: "Discover" }));
    await screen.findAllByRole("option");
    expect(rust.callsTo("plugin_catalog")).toEqual([{ fresh: false }]);

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(rust.callsTo("plugin_catalog")).toEqual([{ fresh: false }, { fresh: true }]);
    });
  });

  it("draws only a screenful of a catalog of thousands", async () => {
    const thousands = Array.from({ length: 4000 }, (_, at) =>
      offered(`plugin-${String(at).padStart(4, "0")}@market`),
    );
    const { user } = await openApp({ pluginCatalog: thousands }, "/plugins/discover");
    await screen.findAllByRole("option");

    expect(offeredRows().length).toBeLessThan(100);
    await user.type(
      within(sidebar()).getByRole("searchbox", { name: "Search plugins" }),
      "plugin-3999",
    );
    expect(offeredRows()).toHaveLength(1);
  });

  it("puts the details in the list's place, with a way back, when the window is narrow", async () => {
    await page.viewport(500, 700);
    useLayoutStore.setState({ sidebarOpen: false });
    const { user } = await openApp({ pluginCatalog: catalog }, "/plugins/discover");

    await user.click(await screen.findByRole("option", { name: /^github/ }));

    expect(screen.queryByRole("listbox", { name: "Plugins" })).toBeNull();
    expect(screen.getByRole("region", { name: "github" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "All plugins" }));
    expect(screen.getByRole("listbox", { name: "Plugins" })).toBeVisible();
  });

  it("has no accessibility violations", async () => {
    const { user } = await openApp({ pluginCatalog: catalog }, "/plugins/discover");
    await user.click(await screen.findByRole("option", { name: /^github/ }));

    await expectNoAccessibilityViolations(document.body);
  });
});

/** Opens github's details on Discover. */
async function details(options: Options = {}) {
  const opened = await openApp({ pluginCatalog: catalog, ...options }, "/plugins/discover");
  await opened.user.click(await screen.findByRole("option", { name: /^github/ }));
  return opened;
}

describe("Installing a plugin for you in every project (ADR 0053)", () => {
  it("asks who gets it, with the warning, and installs for you in every project", async () => {
    const { rust, user } = await details({
      pluginChange: () => ({
        message: "Successfully installed plugin: github@claude-plugins-official (scope: user)",
        sessionsWaiting: false,
        shownCommand: null,
      }),
    });

    await user.click(screen.getByRole("button", { name: "Install…" }));
    const dialog = await screen.findByRole("dialog", { name: "Install github" });
    expect(within(dialog).getByRole("radio", { name: /For you, in every project/ })).toBeChecked();
    expect(dialog).toHaveTextContent("A plugin can run programs on this computer");
    await user.click(within(dialog).getByRole("button", { name: "Install" }));

    expect(
      await screen.findByText(
        "Successfully installed plugin: github@claude-plugins-official (scope: user)",
      ),
    ).toBeVisible();
    expect(rust.callsTo("install_plugin")).toEqual([
      {
        target: { id: "github@claude-plugins-official", scope: "user", projectId: null },
        acceptCommand: null,
      },
    ]);
    // What the marketplaces offer is read again, and Installed reads what is installed now.
    await waitFor(() => {
      expect(rust.callsTo("plugin_catalog")).toHaveLength(2);
    });
    // The dialog hides the rest of the window until it has quite closed.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await user.click(within(sidebar()).getByRole("link", { name: "Installed" }));
    await waitFor(() => {
      expect(rust.callsTo("installed_plugins")).toHaveLength(1);
    });
  });

  it("says the install is under way", async () => {
    const { user } = await details({ pluginChange: () => new Promise(() => {}) });

    await user.click(screen.getByRole("button", { name: "Install…" }));
    const dialog = await screen.findByRole("dialog", { name: "Install github" });
    await user.click(within(dialog).getByRole("button", { name: "Install" }));

    expect(await screen.findByText("Installing github…")).toBeVisible();
  });

  it("shows Claude Code's own message and the code when the install failed", async () => {
    const { user } = await details({
      pluginChange: () => ({
        code: "ARD-AGT-021",
        messageKey: "errors.ARD-AGT-021",
        details: "Plugin not found in marketplace",
      }),
    });

    await user.click(screen.getByRole("button", { name: "Install…" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Install github" })).getByRole("button", {
        name: "Install",
      }),
    );

    expect(await screen.findByText("Claude Code could not do it.")).toBeVisible();
    expect(screen.getByText("Plugin not found in marketplace")).toBeVisible();
    expect(screen.getByText("ARD-AGT-021")).toBeVisible();
  });

  it("installs nothing when cancelled", async () => {
    const { rust, user } = await details();

    await user.click(screen.getByRole("button", { name: "Install…" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Install github" })).getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(rust.callsTo("install_plugin")).toEqual([]);
  });

  it("has no accessibility violations while it asks", async () => {
    const { user } = await details();

    await user.click(screen.getByRole("button", { name: "Install…" }));
    await animationsDone(await screen.findByRole("dialog", { name: "Install github" }));

    await expectNoAccessibilityViolations(document.body);
  });
});

/** The row of an installed plugin on Installed. */
const rowOf = (name: string) => {
  const row = rows().find((item) => item.querySelector("h2")?.textContent === name);
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};

async function installedTab(options: Options = {}) {
  const opened = await openApp(options, "/plugins/installed");
  await waitFor(() => {
    expect(rows().length).toBeGreaterThan(0);
  });
  return opened;
}

describe("Changing installed plugins (ADR 0053)", () => {
  it("turns a plugin off with its switch, at its scope", async () => {
    const { rust, user } = await installedTab({
      pluginChange: () => ({
        message: "Successfully disabled plugin: superpowers",
        sessionsWaiting: false,
        shownCommand: null,
      }),
    });

    const toggle = within(rowOf("superpowers")).getByRole("switch", { name: "Use superpowers" });
    expect(toggle).toBeChecked();
    await user.click(toggle);

    expect(await screen.findByText("Successfully disabled plugin: superpowers")).toBeVisible();
    expect(rust.callsTo("change_plugin")).toEqual([
      {
        action: "disable",
        target: { id: "superpowers@claude-plugins-official", scope: "user", projectId: null },
        acceptCommand: null,
      },
    ]);
    // What is installed is read again.
    await waitFor(() => {
      expect(rust.callsTo("installed_plugins").length).toBeGreaterThan(1);
    });
  });

  it("updates a plugin", async () => {
    const { rust, user } = await installedTab();

    await user.click(
      within(rowOf("superpowers")).getByRole("button", { name: "Update superpowers" }),
    );

    await waitFor(() => {
      expect(rust.callsTo("change_plugin")).toEqual([
        {
          action: "update",
          target: { id: "superpowers@claude-plugins-official", scope: "user", projectId: null },
          acceptCommand: null,
        },
      ]);
    });
  });

  it("uninstalls a plugin after a confirmation, and Cancel keeps it", async () => {
    const { rust, user } = await installedTab();
    const uninstall = () =>
      user.click(
        within(rowOf("superpowers")).getByRole("button", { name: "Uninstall superpowers" }),
      );

    await uninstall();
    const asked = await screen.findByRole("alertdialog", { name: "Uninstall superpowers?" });
    await user.click(within(asked).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(rust.callsTo("change_plugin")).toEqual([]);

    await uninstall();
    await user.click(
      within(await screen.findByRole("alertdialog", { name: "Uninstall superpowers?" })).getByRole(
        "button",
        { name: "Uninstall" },
      ),
    );
    await waitFor(() => {
      expect(rust.callsTo("change_plugin")).toEqual([
        {
          action: "uninstall",
          target: { id: "superpowers@claude-plugins-official", scope: "user", projectId: null },
          acceptCommand: null,
        },
      ]);
    });
  });

  it("lets a synced plugin be turned off only, and a managed one not at all", async () => {
    await installedTab();

    const synced = rowOf("notes");
    expect(within(synced).getByRole("switch", { name: "Use notes" })).toBeVisible();
    expect(within(synced).queryByRole("button", { name: /Uninstall|Update/ })).toBeNull();
    expect(synced).toHaveTextContent("Remove it on claude.ai.");
    const managed = rowOf("policy");
    expect(within(managed).queryByRole("switch")).toBeNull();
    expect(within(managed).queryByRole("button")).toBeNull();
  });

  it("changes a project's plugin in that project, once the project is trusted", async () => {
    const { rust, user } = await installedTab({
      folders: [folderProject("api", "billing-api", true)],
    });

    await user.click(within(rowOf("deploy")).getByRole("switch", { name: "Use deploy" }));

    await waitFor(() => {
      expect(rust.callsTo("change_plugin")).toEqual([
        {
          action: "enable",
          target: { id: "deploy@acme", scope: "project", projectId: "api" },
          acceptCommand: null,
        },
      ]);
    });
  });

  it("asks to trust a project first, and Cancel changes nothing", async () => {
    const { rust, user } = await installedTab({
      folders: [folderProject("api", "billing-api", false)],
    });
    const toggle = () =>
      user.click(within(rowOf("deploy")).getByRole("switch", { name: "Use deploy" }));

    await toggle();
    const asked = await screen.findByRole("alertdialog", { name: /Trust “billing-api”/ });
    await user.click(within(asked).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(rust.callsTo("change_plugin")).toEqual([]);

    await toggle();
    await user.click(
      within(await screen.findByRole("alertdialog", { name: /Trust “billing-api”/ })).getByRole(
        "button",
        { name: "Trust folder" },
      ),
    );
    await waitFor(() => {
      expect(rust.callsTo("trust_project")).toEqual([{ projectId: "api" }]);
      expect(rust.callsTo("change_plugin")).toHaveLength(1);
    });
  });

  it("says to open a project's folder first when it is not a project in Arden Code", async () => {
    await installedTab();

    const deploy = rowOf("deploy");
    expect(within(deploy).queryByRole("switch")).toBeNull();
    expect(deploy).toHaveTextContent(
      "Open C:\\Work\\billing-api as a project in Arden Code to change this plugin here.",
    );
  });

  it("shows Claude Code's own words when it refuses", async () => {
    const { user } = await installedTab({
      pluginChange: () => ({
        code: "ARD-AGT-021",
        messageKey: "errors.ARD-AGT-021",
        details: "Plugin is required by another plugin",
      }),
    });

    await user.click(
      within(rowOf("superpowers")).getByRole("button", { name: "Uninstall superpowers" }),
    );
    await user.click(
      within(await screen.findByRole("alertdialog", { name: "Uninstall superpowers?" })).getByRole(
        "button",
        { name: "Uninstall" },
      ),
    );

    expect(await screen.findByText("Plugin is required by another plugin")).toBeVisible();
  });

  it("has no accessibility violations", async () => {
    await installedTab({ folders: [folderProject("api", "billing-api", true)] });

    await expectNoAccessibilityViolations(document.body);
  });
});

describe("Giving running sessions a plugin change (ADR 0053)", () => {
  it("says when a session gets the change only when its Claude Code next starts", async () => {
    const { user } = await details({
      pluginChange: () => ({ message: "Installed.", sessionsWaiting: true, shownCommand: null }),
    });

    await user.click(screen.getByRole("button", { name: "Install…" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Install github" })).getByRole("button", {
        name: "Install",
      }),
    );

    expect(
      await screen.findByText(
        "A session that is open gets it when its Claude Code next starts, so that its conversation is not read again at full price.",
      ),
    ).toBeVisible();
  });

  it("reads the slash commands again, so a new plugin's skills can be run", async () => {
    const { rust, user } = await details();
    const before = rust.callsTo("claude_catalog").length;

    await user.click(screen.getByRole("button", { name: "Install…" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: "Install github" })).getByRole("button", {
        name: "Install",
      }),
    );

    await waitFor(() => {
      expect(rust.callsTo("claude_catalog").length).toBeGreaterThan(before);
    });
    expect(screen.queryByText(/next starts/)).toBeNull();
  });
});

/** Opens github's details on Discover, coming from a session in the website project. */
async function fromSession(options: Options = {}) {
  const opened = await openApp({
    pluginCatalog: catalog,
    folders: [folderProject("api", "billing-api", true), folderProject("site", "website", true)],
    sessions: [
      {
        ...sessionNamed("session-1", "Fix the build", "site"),
        updatedAt: "2026-10-01T09:00:00Z",
      },
      { ...sessionNamed("session-2", "Older", "api"), updatedAt: "2026-10-02T09:00:00Z" },
    ],
    ...options,
  });
  await opened.user.click(within(sidebar()).getByRole("link", { name: "Plugins" }));
  await opened.user.click(await screen.findByRole("option", { name: /^github/ }));
  await opened.user.click(screen.getByRole("button", { name: "Install…" }));
  const dialog = await screen.findByRole("dialog", { name: "Install github" });
  await animationsDone(dialog);
  return { ...opened, dialog };
}

describe("Installing a plugin for a project (ADR 0053)", () => {
  it("offers the three choices, saying everyone's changes the project's shared settings", async () => {
    const { dialog } = await fromSession();

    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("aria-label") ?? radio.id),
    ).toHaveLength(3);
    expect(within(dialog).getByRole("radio", { name: /For you, in every project/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /For you, in this project/ })).toBeVisible();
    expect(
      within(dialog).getByRole("radio", { name: /For everyone in this project/ }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(".claude/settings.json");
    expect(within(dialog).queryByRole("combobox", { name: "Project" })).toBeNull();
  });

  it("takes a folder project from a menu, the open session's first, without the Playground", async () => {
    const { rust, user, dialog } = await fromSession();

    await user.click(within(dialog).getByRole("radio", { name: /For you, in this project/ }));
    const menu = within(dialog).getByRole("combobox", { name: "Project" });
    expect(
      within(menu)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["website", "billing-api"]);
    await user.click(within(dialog).getByRole("button", { name: "Install" }));

    await waitFor(() => {
      expect(rust.callsTo("install_plugin")).toEqual([
        {
          target: { id: "github@claude-plugins-official", scope: "local", projectId: "site" },
          acceptCommand: null,
        },
      ]);
    });
  });

  it("installs for everyone in the project chosen", async () => {
    const { rust, user, dialog } = await fromSession();

    await user.click(within(dialog).getByRole("radio", { name: /For everyone in this project/ }));
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Project" }),
      "billing-api",
    );
    await user.click(within(dialog).getByRole("button", { name: "Install" }));

    await waitFor(() => {
      expect(rust.callsTo("install_plugin")).toEqual([
        {
          target: { id: "github@claude-plugins-official", scope: "project", projectId: "api" },
          acceptCommand: null,
        },
      ]);
    });
  });

  it("asks to trust the project first, and Cancel installs nothing", async () => {
    const { rust, user, dialog } = await fromSession({
      folders: [
        folderProject("api", "billing-api", false),
        folderProject("site", "website", false),
      ],
    });

    await user.click(within(dialog).getByRole("radio", { name: /For you, in this project/ }));
    await user.click(within(dialog).getByRole("button", { name: "Install" }));
    const asked = await screen.findByRole("alertdialog", { name: /Trust “website”/ });
    await animationsDone(asked);
    await user.click(within(asked).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(rust.callsTo("install_plugin")).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Install…" }));
    const again = await screen.findByRole("dialog", { name: "Install github" });
    await user.click(within(again).getByRole("radio", { name: /For you, in this project/ }));
    await user.click(within(again).getByRole("button", { name: "Install" }));
    await user.click(
      within(await screen.findByRole("alertdialog", { name: /Trust “website”/ })).getByRole(
        "button",
        { name: "Trust folder" },
      ),
    );
    await waitFor(() => {
      expect(rust.callsTo("trust_project")).toEqual([{ projectId: "site" }]);
      expect(rust.callsTo("install_plugin")).toEqual([
        {
          target: { id: "github@claude-plugins-official", scope: "local", projectId: "site" },
          acceptCommand: null,
        },
      ]);
    });
  });

  it("says a folder must be opened first when there is no folder project", async () => {
    const { dialog } = await fromSession({
      folders: [],
      sessions: [sessionNamed("session-1", "Fix")],
    });

    expect(within(dialog).getByRole("radio", { name: /For you, in this project/ })).toBeDisabled();
    expect(dialog).toHaveTextContent("Open a folder as a project to install a plugin for it.");
  });

  it("has no accessibility violations with the project menu open", async () => {
    const { user, dialog } = await fromSession();

    await user.click(within(dialog).getByRole("radio", { name: /For everyone in this project/ }));

    await expectNoAccessibilityViolations(document.body);
  });
});

/** A command the github plugin's marketplace declares (ADR 0053). */
const sha256 = "ab".repeat(32);
const declared = "npx -y @acme/deploy-cli@0.9.2 setup --cluster staging";

/** Rust's answers: the command shown first, then installed once it is accepted. */
function declaring(changed = false) {
  return (_command: string, payload: unknown) => {
    const { acceptCommand: accepted } = z
      .object({ acceptCommand: z.string().nullable() })
      .parse(payload);
    return accepted === sha256
      ? { message: "Installed github.", sessionsWaiting: false, shownCommand: null }
      : {
          message: "github declares a command.",
          sessionsWaiting: false,
          shownCommand: {
            command: declared,
            plugin: "github@claude-plugins-official",
            sha256,
            changed,
          },
        };
  };
}

async function install(options: Options) {
  const opened = await details(options);
  await opened.user.click(screen.getByRole("button", { name: "Install…" }));
  await opened.user.click(
    within(await screen.findByRole("dialog", { name: "Install github" })).getByRole("button", {
      name: "Install",
    }),
  );
  const asked = await screen.findByRole("alertdialog", { name: "Run a command for github?" });
  await animationsDone(asked);
  return { ...opened, asked };
}

describe("Accepting a command a marketplace declares (ADR 0053)", () => {
  it("shows the command in full, in the code font, and accepting passes exactly its sha256", async () => {
    const { rust, user, asked } = await install({ pluginChange: declaring() });

    const code = within(asked).getByText(declared);
    expect(code.closest("pre, code")).not.toBeNull();
    expect(asked).toHaveTextContent("github@claude-plugins-official");
    await user.click(within(asked).getByRole("button", { name: "Run it and install" }));

    expect(await screen.findByText("Installed github.")).toBeVisible();
    const installs = z
      .array(z.object({ acceptCommand: z.string().nullable() }))
      .parse(rust.callsTo("install_plugin"));
    expect(installs.map((call) => call.acceptCommand)).toEqual([null, sha256]);
  });

  it("runs nothing more when cancelled", async () => {
    const { rust, user, asked } = await install({ pluginChange: declaring() });

    await user.click(within(asked).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(rust.callsTo("install_plugin")).toHaveLength(1);
  });

  it("says when the command changed since it was accepted", async () => {
    const { asked } = await install({ pluginChange: declaring(true) });

    expect(asked).toHaveTextContent("The command changed since it was last shown.");
  });

  it("has no accessibility violations", async () => {
    await install({ pluginChange: declaring() });

    await expectNoAccessibilityViolations(document.body);
  });
});

const added: Marketplace[] = [
  {
    agent: "claude",
    name: "claude-plugins-official",
    source: "anthropics/claude-plugins-official",
  },
  {
    agent: "claude",
    name: "acme",
    source: "https://git.acme.example/platform/marketplace.git · main",
  },
];

async function marketplacesTab(options: Options = {}) {
  const opened = await openApp({ marketplaces: added, ...options }, "/plugins/marketplaces");
  await screen.findByRole("list", { name: "Marketplaces" });
  return opened;
}

/** The row of a marketplace. */
const marketplaceRow = (name: string) => {
  const row = within(screen.getByRole("list", { name: "Marketplaces" }))
    .getAllByRole("listitem")
    .find((item) => item.querySelector("h2")?.textContent === name);
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};

describe("Managing marketplaces (ADR 0053)", () => {
  it("lists the marketplaces with where they come from", async () => {
    await marketplacesTab();

    expect(marketplaceRow("claude-plugins-official")).toHaveTextContent(
      "anthropics/claude-plugins-official",
    );
    expect(marketplaceRow("acme")).toHaveTextContent(
      "https://git.acme.example/platform/marketplace.git · main",
    );
  });

  it("adds a marketplace from the source typed, and says Claude Code's answer", async () => {
    const { rust, user } = await marketplacesTab({
      pluginChange: () => ({
        message: "Successfully added marketplace: skills",
        sessionsWaiting: false,
        shownCommand: null,
      }),
    });

    await user.type(screen.getByRole("textbox", { name: "Source" }), "mattpocock/skills");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Successfully added marketplace: skills")).toBeVisible();
    expect(rust.callsTo("add_marketplace")).toEqual([{ source: "mattpocock/skills" }]);
  });

  it("shows Claude Code's own words and the code when a source is refused", async () => {
    const { user } = await marketplacesTab({
      pluginChange: () => ({
        code: "ARD-AGT-021",
        messageKey: "errors.ARD-AGT-021",
        details: "Invalid marketplace source format. Try: owner/repo, https://..., or ./path",
      }),
    });

    await user.type(screen.getByRole("textbox", { name: "Source" }), "gitlab.example.com/team");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText(
        "Invalid marketplace source format. Try: owner/repo, https://..., or ./path",
      ),
    ).toBeVisible();
    expect(screen.getByText("ARD-AGT-021")).toBeVisible();
  });

  it("updates a marketplace's listing", async () => {
    const { rust, user } = await marketplacesTab();

    await user.click(within(marketplaceRow("acme")).getByRole("button", { name: "Update acme" }));

    await waitFor(() => {
      expect(rust.callsTo("change_marketplace")).toEqual([{ action: "update", name: "acme" }]);
    });
  });

  it("removes a marketplace after a confirmation that counts the plugins it uninstalls", async () => {
    const { rust, user } = await marketplacesTab();
    const remove = () =>
      user.click(within(marketplaceRow("acme")).getByRole("button", { name: "Remove acme" }));

    await remove();
    const asked = await screen.findByRole("alertdialog", { name: "Remove acme?" });
    await animationsDone(asked);
    expect(asked).toHaveTextContent("It also uninstalls the 1 plugin installed from it.");
    await user.click(within(asked).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(rust.callsTo("change_marketplace")).toEqual([]);

    await remove();
    const again = await screen.findByRole("alertdialog", { name: "Remove acme?" });
    await animationsDone(again);
    await user.click(within(again).getByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(rust.callsTo("change_marketplace")).toEqual([{ action: "remove", name: "acme" }]);
    });
  });

  it("has no accessibility violations", async () => {
    await marketplacesTab();

    await expectNoAccessibilityViolations(document.body);
  });
});

describe("Anthropic's official marketplace on Discover (ADR 0053)", () => {
  it("is offered when none of the plugins comes from it", async () => {
    const { rust, user } = await openApp(
      { pluginCatalog: [offered("alpha-tools@acme")] },
      "/plugins/discover",
    );

    await user.click(
      await screen.findByRole("button", { name: "Add Anthropic's official marketplace" }),
    );

    await waitFor(() => {
      expect(rust.callsTo("add_marketplace")).toEqual([
        { source: "anthropics/claude-plugins-official" },
      ]);
    });
  });

  it("is not offered when it is there", async () => {
    await openApp({ pluginCatalog: catalog }, "/plugins/discover");
    await screen.findAllByRole("option");

    expect(
      screen.queryByRole("button", { name: "Add Anthropic's official marketplace" }),
    ).toBeNull();
  });
});

describe("Updating a plugin whose marketplace declares a command (ADR 0053)", () => {
  it("shows the command first, and accepting updates with exactly its sha256", async () => {
    const { rust, user } = await installedTab({ pluginChange: declaring() });

    await user.click(
      within(rowOf("superpowers")).getByRole("button", { name: "Update superpowers" }),
    );
    const asked = await screen.findByRole("alertdialog", { name: "Run a command for github?" });
    await animationsDone(asked);
    expect(within(asked).getByText(declared)).toBeVisible();
    await user.click(within(asked).getByRole("button", { name: "Run it and install" }));

    await waitFor(() => {
      expect(rust.callsTo("change_plugin")).toHaveLength(2);
    });
    expect(rust.callsTo("change_plugin")[1]).toMatchObject({
      action: "update",
      acceptCommand: sha256,
    });
  });
});
