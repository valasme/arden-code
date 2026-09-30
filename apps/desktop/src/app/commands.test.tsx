import { createMemoryHistory } from "@tanstack/react-router";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";
import { z } from "zod";

import { commandDefinitions } from "@/features/commands/registry";
import { formatShortcut } from "@/features/commands/shortcuts";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { animationsDone } from "@/test/animations";
import { settingsWith } from "@/test/settings";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { App } from "./App";

import "@/styles/global.css";

/** The settings the app starts with; a test sets it before drawing the app. */
let startingSettings = settingsWith();

function renderApp(entries = ["/"], initialIndex = entries.length - 1) {
  Object.assign(globalThis, { isTauri: true });
  mockWindows("main");
  const calls: { command: string; payload: unknown }[] = [];
  mockIPC(
    (command, payload) => {
      calls.push({ command, payload });
      if (command === "app_info") return { name: "Arden Code", version: "0.1.0" };
      if (command === "get_settings") return startingSettings;
      if (command === "change_setting") {
        const { change } = z
          .object({ change: z.object({ appearanceZoom: z.number() }) })
          .parse(payload);
        return settingsWith({ appearance: { zoom: change.appearanceZoom } });
      }
      if (command === "plugin:window|is_fullscreen") return false;
      return null;
    },
    { shouldMockEvents: true },
  );
  render(<App history={createMemoryHistory({ initialEntries: entries, initialIndex })} />);
  return calls;
}

beforeEach(async () => {
  startingSettings = settingsWith();
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

/** Types a key on a keyboard whose layout produced `key` from the physical key `code`. */
function pressOnLayout(
  key: string,
  code: string,
  modifiers: { ctrlKey?: boolean; altKey?: boolean },
) {
  const event = new KeyboardEvent("keydown", {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  window.dispatchEvent(event);
  return event;
}

const sidebar = () => screen.queryByRole("complementary", { name: "Sidebar" });

describe("the command palette", () => {
  it.each(["{Control>}k{/Control}", "{Control>}{Shift>}p{/Shift}{/Control}"])(
    "opens with %s",
    async (keys) => {
      const user = userEvent.setup();
      renderApp();
      await screen.findByRole("main");

      await user.keyboard(keys);

      const dialog = await screen.findByRole("dialog", { name: "Command palette" });
      await animationsDone(dialog);
      expect(dialog).toBeVisible();
      expect(screen.getByRole("combobox")).toHaveFocus();
    },
  );

  it("opens from the search field in the title bar", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /^Search or run a command/ }));

    const dialog = await screen.findByRole("dialog", { name: "Command palette" });
    await animationsDone(dialog);
    expect(dialog).toBeVisible();
  });

  it("lists every command with its shortcut", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "Command palette" });

    // "Focus the message box" needs a message box, which does not exist yet, so it is not offered.
    for (const [label, shortcut] of [
      ["Command palette", "Ctrl+K"],
      ["Settings", "Ctrl+,"],
      ["Toggle sidebar", "Ctrl+B"],
      ["Toggle inspector", "Ctrl+J"],
      ["Full screen", "F11"],
      ["Keyboard shortcuts", "Ctrl+/"],
    ] as const) {
      const option = within(palette).getByRole("option", { name: new RegExp(label) });
      expect(option, label).toHaveTextContent(shortcut);
    }
    expect(within(palette).queryByRole("option", { name: /Focus the message box/ })).toBeNull();
  });

  it("filters as the person types, and runs the chosen command with Enter", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");
    expect(sidebar()).toBeVisible();

    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("side");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("Toggle sidebar");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(sidebar()).toBeNull();
      expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    });
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("zzzzzz");

    expect(await screen.findByText("No command matches.")).toBeVisible();
  });

  it("closes with Escape", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog", { name: "Command palette" });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    });
  });

  it("has no accessibility violations", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");
    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "Command palette" });
    await animationsDone(palette);

    await expectNoAccessibilityViolations(palette);
  });
});

describe("the default shortcuts", () => {
  it("open the settings with Ctrl+,", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>},{/Control}");

    expect(await screen.findByRole("heading", { level: 1, name: "General" })).toBeVisible();
  });

  it("toggle the sidebar with Ctrl+B and the inspector with Ctrl+J", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}b{/Control}");
    await waitFor(() => {
      expect(sidebar()).toBeNull();
    });
    await user.keyboard("{Control>}b{/Control}");
    await waitFor(() => {
      expect(sidebar()).toBeVisible();
    });

    await user.keyboard("{Control>}j{/Control}");
    expect(await screen.findByRole("complementary", { name: "Inspector" })).toBeVisible();
  });

  it("toggle full screen with F11", async () => {
    const user = userEvent.setup();
    const calls = renderApp();
    await screen.findByRole("main");

    await user.keyboard("{F11}");

    await waitFor(() => {
      expect(
        calls.find((call) => call.command === "plugin:window|set_fullscreen")?.payload,
      ).toMatchObject({
        value: true,
      });
    });
  });

  it("focus the message box with Ctrl+L, when there is one", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");
    const box = document.createElement("textarea");
    box.setAttribute("data-message-box", "");
    document.body.append(box);

    await user.keyboard("{Control>}l{/Control}");

    expect(box).toHaveFocus();
    box.remove();
  });

  it("go back and forward with Alt+Left and Alt+Right", async () => {
    const user = userEvent.setup();
    renderApp(["/", "/settings/general"]);
    await screen.findByRole("heading", { level: 1, name: "General" });

    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    expect(await screen.findByRole("heading", { name: "Arden Code 0.1.0" })).toBeVisible();

    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    expect(await screen.findByRole("heading", { level: 1, name: "General" })).toBeVisible();
  });

  it("open a cheat sheet with Ctrl+/ that lists every shortcut", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}/{/Control}");
    const sheet = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    await animationsDone(sheet);

    for (const command of commandDefinitions) {
      for (const shortcut of command.shortcuts) {
        expect(sheet, `${command.id}: ${shortcut}`).toHaveTextContent(formatShortcut(shortcut));
      }
    }
    await expectNoAccessibilityViolations(sheet);
  });
});

describe("keyboard layouts", () => {
  it("run a shortcut by the key's position when the layout types a non-Latin letter", async () => {
    renderApp();
    await screen.findByRole("main");

    // On a Russian layout the key at the Latin B position types "и".
    const event = pressOnLayout("и", "KeyB", { ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(sidebar()).toBeNull();
    });
  });

  it("go by the typed letter on other Latin layouts", async () => {
    renderApp();
    await screen.findByRole("main");

    // On a Dvorak layout the key at the Latin V position types "b", which is Ctrl+B.
    pressOnLayout("b", "KeyV", { ctrlKey: true });
    await waitFor(() => {
      expect(sidebar()).toBeNull();
    });
  });

  it("leave AltGr alone, since it types characters", async () => {
    renderApp();
    await screen.findByRole("main");

    // Windows reports AltGr as Ctrl and Alt together.
    const event = pressOnLayout("b", "KeyB", { ctrlKey: true, altKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(sidebar()).toBeVisible();
  });
});

describe("tooltips", () => {
  it("show a command's shortcut", async () => {
    const user = userEvent.setup();
    renderApp(["/", "/settings/general"]);
    await screen.findByRole("heading", { level: 1, name: "General" });

    await user.hover(screen.getByRole("button", { name: "Back" }));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Back");
    expect(tooltip).toHaveTextContent("Alt+←");
  });

  it("show the shortcut of the sidebar button", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.hover(screen.getByRole("button", { name: "Hide sidebar" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Ctrl+B");
  });
});

const zoomChanges = (calls: { command: string; payload: unknown }[]) =>
  calls.filter((call) => call.command === "change_setting").map((call) => call.payload);

describe("the zoom shortcuts", () => {
  it("zoom in with Ctrl+= and Ctrl and the plus sign, and the page follows", async () => {
    const user = userEvent.setup();
    const calls = renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}={/Control}");
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue("--zoom")).toBe("1.1");
    });
    await user.keyboard("{Control>}{Shift>}+{/Shift}{/Control}");

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue("--zoom")).toBe("1.25");
    });
    expect(zoomChanges(calls)).toEqual([
      { change: { appearanceZoom: 110 } },
      { change: { appearanceZoom: 125 } },
    ]);
    // Everything is sized in rem, so the root size is what scales the whole window.
    expect(getComputedStyle(document.documentElement).fontSize).toBe("20px");
  });

  it("zoom out with Ctrl+-", async () => {
    const user = userEvent.setup();
    const calls = renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}-{/Control}");

    await waitFor(() => {
      expect(zoomChanges(calls)).toEqual([{ change: { appearanceZoom: 90 } }]);
    });
  });

  it("goes back to 100% with Ctrl+0", async () => {
    startingSettings = settingsWith({ appearance: { zoom: 150 } });
    const user = userEvent.setup();
    const calls = renderApp();
    await screen.findByRole("main");
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue("--zoom")).toBe("1.5");
    });

    await user.keyboard("{Control>}0{/Control}");

    await waitFor(() => {
      expect(zoomChanges(calls)).toEqual([{ change: { appearanceZoom: 100 } }]);
    });
    expect(document.documentElement.style.getPropertyValue("--zoom")).toBe("1");
  });

  it("are in the command palette with their shortcuts", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}k{/Control}");
    const palette = await screen.findByRole("dialog", { name: "Command palette" });

    expect(within(palette).getByRole("option", { name: /Zoom in/ })).toHaveTextContent("Ctrl+=");
    expect(within(palette).getByRole("option", { name: /Zoom out/ })).toHaveTextContent("Ctrl+-");
    expect(within(palette).getByRole("option", { name: /Reset zoom/ })).toHaveTextContent("Ctrl+0");
  });
});

const custom = () =>
  settingsWith({
    keyboard: { shortcuts: { "palette.open": ["Ctrl+Shift+O"], "sidebar.toggle": [] } },
  });

describe("shortcuts a person changed", () => {
  it("work in place of the defaults", async () => {
    startingSettings = custom();
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull();
    await user.keyboard("{Control>}{Shift>}o{/Shift}{/Control}");

    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeVisible();
  });

  it("leave a command without a shortcut when it was emptied", async () => {
    startingSettings = custom();
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}b{/Control}");

    expect(sidebar()).toBeVisible();
  });

  it("show in the command palette, the cheat sheet and the tooltips", async () => {
    startingSettings = custom();
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Control>}{Shift>}o{/Shift}{/Control}");
    const palette = await screen.findByRole("dialog", { name: "Command palette" });
    expect(within(palette).getByRole("option", { name: /Command palette/ })).toHaveTextContent(
      "Ctrl+Shift+O",
    );
    expect(within(palette).getByRole("option", { name: /Toggle sidebar/ }).textContent).not.toMatch(
      /Ctrl/,
    );
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await user.hover(await screen.findByRole("button", { name: "Hide sidebar" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).not.toHaveTextContent("Ctrl+B");

    await user.keyboard("{Control>}/{/Control}");
    const sheet = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(sheet).getByRole("row", { name: /Command palette/ })).toHaveTextContent(
      "Ctrl+Shift+O",
    );
    expect(within(sheet).getByRole("row", { name: /Command palette/ })).not.toHaveTextContent(
      "Ctrl+K",
    );
  });
});

const areaWithFocus = () =>
  document.activeElement?.closest("[data-area]")?.getAttribute("data-area") ?? "none";

describe("F6 and Shift+F6", () => {
  it("move the focus through the title bar, sidebar, session view and status bar, and around again", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");
    expect(areaWithFocus()).toBe("none");

    const seen: string[] = [];
    for (let press = 0; press < 5; press += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each press depends on the one before
      await user.keyboard("{F6}");
      seen.push(areaWithFocus());
    }

    expect(seen).toEqual(["titlebar", "sidebar", "session", "statusbar", "titlebar"]);
  });

  it("go the other way with Shift", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");

    await user.keyboard("{Shift>}{F6}{/Shift}");
    expect(areaWithFocus()).toBe("statusbar");
    await user.keyboard("{Shift>}{F6}{/Shift}");
    expect(areaWithFocus()).toBe("session");
    await user.keyboard("{Shift>}{F6}{/Shift}");
    expect(areaWithFocus()).toBe("sidebar");
  });

  it("include the inspector once it is open, and leave out a sidebar that is hidden", async () => {
    useLayoutStore.setState({ inspectorOpen: true, sidebarOpen: false });
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole("main");
    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Inspector" })).toBeVisible();
    });

    const seen: string[] = [];
    for (let press = 0; press < 4; press += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each press depends on the one before
      await user.keyboard("{F6}");
      seen.push(areaWithFocus());
    }

    expect(seen).toEqual(["titlebar", "session", "inspector", "statusbar"]);
  });

  it("put the focus on an area that has nothing to press, so the keyboard can still start there", async () => {
    const user = userEvent.setup();
    renderApp(["/"]);
    await screen.findByRole("main");

    await user.keyboard("{F6}{F6}{F6}");

    expect(areaWithFocus()).toBe("session");
    expect(document.activeElement).toBeVisible();
  });
});
