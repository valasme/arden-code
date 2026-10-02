import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CommandIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  KeyboardIcon,
  MaximizeIcon,
  PanelLeftIcon,
  PanelRightIcon,
  RotateCcwIcon,
  SettingsIcon,
  SquareIcon,
  SquarePenIcon,
  TextCursorInputIcon,
  ZoomInIcon,
  ZoomOutIcon,
  type LucideIcon,
} from "lucide-react";

/** The identity of every command. Later tickets add theirs here. */
export type CommandId =
  | "palette.open"
  | "session.new"
  | "reply.stop"
  | "settings.open"
  | "sidebar.toggle"
  | "inspector.toggle"
  | "messageBox.focus"
  | "window.fullScreen"
  | "shortcuts.show"
  | "navigate.back"
  | "navigate.forward"
  | "zoom.in"
  | "zoom.out"
  | "zoom.reset"
  | "focus.next"
  | "focus.previous";

/** The groups the command palette and the cheat sheet list commands in, in this order. */
export const commandGroups = ["session", "goTo", "view"] as const;

export type CommandGroup = (typeof commandGroups)[number];

export interface CommandDefinition {
  id: CommandId;
  /** The key of the command's name in the language file. */
  labelKey:
    | "commands.paletteOpen"
    | "commands.sessionNew"
    | "commands.replyStop"
    | "commands.settingsOpen"
    | "commands.sidebarToggle"
    | "commands.inspectorToggle"
    | "commands.messageBoxFocus"
    | "commands.windowFullScreen"
    | "commands.shortcutsShow"
    | "commands.navigateBack"
    | "commands.navigateForward"
    | "commands.zoomIn"
    | "commands.zoomOut"
    | "commands.zoomReset"
    | "commands.focusNext"
    | "commands.focusPrevious";
  icon: LucideIcon;
  /** Where the command is listed in the command palette and the cheat sheet. */
  group: CommandGroup;
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
    group: "goTo",
    labelKey: "commands.paletteOpen",
    icon: CommandIcon,
    shortcuts: ["Ctrl+K", "Ctrl+Shift+P"],
  },
  {
    id: "session.new",
    group: "session",
    labelKey: "commands.sessionNew",
    icon: SquarePenIcon,
    shortcuts: ["Ctrl+N"],
  },
  {
    id: "reply.stop",
    group: "session",
    labelKey: "commands.replyStop",
    icon: SquareIcon,
    shortcuts: ["Escape"],
  },
  {
    id: "settings.open",
    group: "goTo",
    labelKey: "commands.settingsOpen",
    icon: SettingsIcon,
    shortcuts: ["Ctrl+,"],
  },
  {
    id: "sidebar.toggle",
    group: "view",
    labelKey: "commands.sidebarToggle",
    icon: PanelLeftIcon,
    shortcuts: ["Ctrl+B"],
  },
  {
    id: "inspector.toggle",
    group: "view",
    labelKey: "commands.inspectorToggle",
    icon: PanelRightIcon,
    shortcuts: ["Ctrl+J"],
  },
  {
    id: "messageBox.focus",
    group: "session",
    labelKey: "commands.messageBoxFocus",
    icon: TextCursorInputIcon,
    shortcuts: ["Ctrl+L"],
  },
  {
    id: "window.fullScreen",
    group: "view",
    labelKey: "commands.windowFullScreen",
    icon: MaximizeIcon,
    shortcuts: ["F11"],
  },
  {
    id: "shortcuts.show",
    group: "goTo",
    labelKey: "commands.shortcutsShow",
    icon: KeyboardIcon,
    shortcuts: ["Ctrl+/"],
  },
  {
    id: "navigate.back",
    group: "goTo",
    labelKey: "commands.navigateBack",
    icon: ArrowLeftIcon,
    shortcuts: ["Alt+ArrowLeft"],
  },
  {
    id: "navigate.forward",
    group: "goTo",
    labelKey: "commands.navigateForward",
    icon: ArrowRightIcon,
    shortcuts: ["Alt+ArrowRight"],
  },
  {
    id: "zoom.in",
    group: "view",
    labelKey: "commands.zoomIn",
    icon: ZoomInIcon,
    shortcuts: ["Ctrl+="],
  },
  {
    id: "zoom.out",
    group: "view",
    labelKey: "commands.zoomOut",
    icon: ZoomOutIcon,
    shortcuts: ["Ctrl+-"],
  },
  {
    id: "zoom.reset",
    group: "view",
    labelKey: "commands.zoomReset",
    icon: RotateCcwIcon,
    shortcuts: ["Ctrl+0"],
  },
  {
    id: "focus.next",
    group: "goTo",
    labelKey: "commands.focusNext",
    icon: ChevronsRightIcon,
    shortcuts: ["F6"],
  },
  {
    id: "focus.previous",
    group: "goTo",
    labelKey: "commands.focusPrevious",
    icon: ChevronsLeftIcon,
    shortcuts: ["Shift+F6"],
  },
] as const satisfies readonly CommandDefinition[];

/** The most shortcuts one command can have. Rust keeps to the same number. */
export const MAX_SHORTCUTS_PER_COMMAND = 3;

/**
 * The shortcuts a command has: the ones a person set (which may be none), or else the defaults.
 * `changed` is what the settings hold for the commands that were changed.
 */
export function effectiveShortcuts(
  definition: CommandDefinition,
  changed: Partial<Record<string, readonly string[]>>,
): readonly string[] {
  return changed[definition.id] ?? definition.shortcuts;
}

export function definitionOf(id: CommandId): CommandDefinition {
  const definition = commandDefinitions.find((command) => command.id === id);
  if (!definition) throw new Error(`there is no command "${id}"`);
  return definition;
}
