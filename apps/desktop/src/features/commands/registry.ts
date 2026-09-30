import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CommandIcon,
  KeyboardIcon,
  MaximizeIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SettingsIcon,
  TextCursorInputIcon,
  type LucideIcon,
} from "lucide-react";

/** The identity of every command. Later tickets add theirs here. */
export type CommandId =
  | "palette.open"
  | "settings.open"
  | "sidebar.toggle"
  | "inspector.toggle"
  | "messageBox.focus"
  | "window.fullScreen"
  | "shortcuts.show"
  | "navigate.back"
  | "navigate.forward";

export interface CommandDefinition {
  id: CommandId;
  /** The key of the command's name in the language file. */
  labelKey:
    | "commands.paletteOpen"
    | "commands.settingsOpen"
    | "commands.sidebarToggle"
    | "commands.inspectorToggle"
    | "commands.messageBoxFocus"
    | "commands.windowFullScreen"
    | "commands.shortcutsShow"
    | "commands.navigateBack"
    | "commands.navigateForward";
  icon: LucideIcon;
  /**
   * Default shortcuts, the first being the one shown. They never use Ctrl+Alt with a letter (AltGr
   * types characters on many layouts), the Windows key, or a key Windows reserves; a test checks it.
   */
  shortcuts: readonly string[];
}

/**
 * Every command the app has. The command palette, the cheat sheet, tooltips and the Keyboard
 * settings tab all read this list, so a command is defined once and shows up everywhere.
 */
export const commandDefinitions = [
  {
    id: "palette.open",
    labelKey: "commands.paletteOpen",
    icon: CommandIcon,
    shortcuts: ["Ctrl+K", "Ctrl+Shift+P"],
  },
  {
    id: "settings.open",
    labelKey: "commands.settingsOpen",
    icon: SettingsIcon,
    shortcuts: ["Ctrl+,"],
  },
  {
    id: "sidebar.toggle",
    labelKey: "commands.sidebarToggle",
    icon: PanelLeftIcon,
    shortcuts: ["Ctrl+B"],
  },
  {
    id: "inspector.toggle",
    labelKey: "commands.inspectorToggle",
    icon: PanelRightIcon,
    shortcuts: ["Ctrl+J"],
  },
  {
    id: "messageBox.focus",
    labelKey: "commands.messageBoxFocus",
    icon: TextCursorInputIcon,
    shortcuts: ["Ctrl+L"],
  },
  {
    id: "window.fullScreen",
    labelKey: "commands.windowFullScreen",
    icon: MaximizeIcon,
    shortcuts: ["F11"],
  },
  {
    id: "shortcuts.show",
    labelKey: "commands.shortcutsShow",
    icon: KeyboardIcon,
    shortcuts: ["Ctrl+/"],
  },
  {
    id: "navigate.back",
    labelKey: "commands.navigateBack",
    icon: ArrowLeftIcon,
    shortcuts: ["Alt+ArrowLeft"],
  },
  {
    id: "navigate.forward",
    labelKey: "commands.navigateForward",
    icon: ArrowRightIcon,
    shortcuts: ["Alt+ArrowRight"],
  },
] as const satisfies readonly CommandDefinition[];

export function definitionOf(id: CommandId): CommandDefinition {
  const definition = commandDefinitions.find((command) => command.id === id);
  if (!definition) throw new Error(`there is no command "${id}"`);
  return definition;
}
