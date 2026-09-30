import { useNavigate } from "@tanstack/react-router";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";

import { useChangeSetting, useSettings } from "@/features/settings/useSettings";
import { nextZoom } from "@/features/settings/zoom";
import { defaultSettings } from "@/ipc/defaults.gen";
import { useNavigationHistory } from "@/lib/useNavigationHistory";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";

import {
  commandDefinitions,
  definitionOf,
  effectiveShortcuts,
  type CommandDefinition,
  type CommandId,
} from "./registry";
import { matchesShortcut, parseShortcut } from "./shortcuts";

/** A command as the app can use it: its definition, and whether it can run right now. */
export interface AvailableCommand extends CommandDefinition {
  enabled: boolean;
}

interface Commands {
  commands: readonly AvailableCommand[];
  run: (id: CommandId) => void;
}

const CommandsContext = createContext<Commands | undefined>(undefined);

/** The commands, and a way to run one. Must be used inside `CommandsProvider`. */
export function useCommands(): Commands {
  const commands = useContext(CommandsContext);
  if (!commands) throw new Error("useCommands needs a CommandsProvider above it");
  return commands;
}

function available(
  definition: CommandDefinition,
  shortcuts: readonly string[],
  enabled: boolean,
): AvailableCommand {
  return { ...definition, shortcuts, enabled };
}

/**
 * The shortcuts a command has now: the person's own when they changed them, else the defaults. It
 * also works outside the provider, such as in a test that draws one control, with the defaults.
 */
export function useShortcutsOf(id: CommandId): readonly string[] {
  const commands = useContext(CommandsContext);
  return (
    commands?.commands.find((command) => command.id === id)?.shortcuts ?? definitionOf(id).shortcuts
  );
}

function findMessageBox(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-message-box]");
}

async function toggleFullScreen() {
  if (!isTauri()) return;
  const window = getCurrentWindow();
  await window.setFullscreen(!(await window.isFullscreen()));
}

/**
 * Makes every command in the registry runnable, and listens for their shortcuts. This is the one
 * place that knows what each command does.
 */
export function CommandsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const history = useNavigationHistory();
  const toggleSidebar = useLayoutStore((state) => state.toggleSidebar);
  const toggleInspector = useLayoutStore((state) => state.toggleInspector);
  const setPaletteOpen = useOverlayStore((state) => state.setPaletteOpen);
  const setCheatSheetOpen = useOverlayStore((state) => state.setCheatSheetOpen);
  const { appearance, keyboard } = useSettings();
  const { zoom } = appearance;
  const changed = keyboard.shortcuts;
  const { mutate: changeSetting } = useChangeSetting();

  const value = useMemo<Commands>(() => {
    const actions: Record<CommandId, { run: () => void; enabled?: () => boolean }> = {
      "palette.open": { run: () => setPaletteOpen(true) },
      "settings.open": {
        run: () => void navigate({ to: "/settings/$tab", params: { tab: "general" } }),
      },
      "sidebar.toggle": { run: toggleSidebar },
      "inspector.toggle": { run: toggleInspector },
      // There is no message box until sessions exist; the command waits for one.
      "messageBox.focus": {
        run: () => findMessageBox()?.focus(),
        enabled: () => findMessageBox() !== null,
      },
      "window.fullScreen": { run: () => void toggleFullScreen().catch(() => {}) },
      "shortcuts.show": { run: () => setCheatSheetOpen(true) },
      "navigate.back": { run: history.onBack, enabled: () => history.canGoBack },
      "navigate.forward": { run: history.onForward, enabled: () => history.canGoForward },
      "zoom.in": { run: () => changeSetting({ appearanceZoom: nextZoom(zoom, "in") }) },
      "zoom.out": { run: () => changeSetting({ appearanceZoom: nextZoom(zoom, "out") }) },
      "zoom.reset": {
        run: () => changeSetting({ appearanceZoom: defaultSettings.appearance.zoom }),
      },
    };
    return {
      // A person's own shortcuts replace the defaults everywhere the shortcut is shown or used.
      commands: commandDefinitions.map((definition) =>
        available(
          definition,
          effectiveShortcuts(definition, changed),
          actions[definition.id].enabled?.() ?? true,
        ),
      ),
      run: (id) => {
        const action = actions[id];
        if (action.enabled?.() ?? true) action.run();
      },
    };
  }, [
    navigate,
    history,
    toggleSidebar,
    toggleInspector,
    setPaletteOpen,
    setCheatSheetOpen,
    zoom,
    changeSetting,
    changed,
  ]);

  useEffect(() => {
    const parsed = value.commands.flatMap((command) =>
      command.shortcuts.map((shortcut) => ({
        id: command.id,
        shortcut: parseShortcut(shortcut),
      })),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      const match = parsed.find(({ shortcut }) => matchesShortcut(event, shortcut));
      if (!match) return;
      // Handled here, so the browser engine must not also act on it (Ctrl+L, Alt+Left, F11 ...).
      event.preventDefault();
      value.run(match.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [value]);

  return <CommandsContext.Provider value={value}>{children}</CommandsContext.Provider>;
}
