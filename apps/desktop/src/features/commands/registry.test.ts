import { resources } from "@/i18n";

import { commandDefinitions } from "./registry";
import { matchesShortcut, parseShortcut } from "./shortcuts";

/** The default shortcuts from the plan's table (section 6.4). This is the independent source. */
const planned: Record<string, readonly string[]> = {
  "palette.open": ["Ctrl+K", "Ctrl+Shift+P"],
  "settings.open": ["Ctrl+,"],
  "sidebar.toggle": ["Ctrl+B"],
  "inspector.toggle": ["Ctrl+J"],
  "messageBox.focus": ["Ctrl+L"],
  "window.fullScreen": ["F11"],
  "shortcuts.show": ["Ctrl+/"],
  "navigate.back": ["Alt+ArrowLeft"],
  "navigate.forward": ["Alt+ArrowRight"],
  "zoom.in": ["Ctrl+="],
  "zoom.out": ["Ctrl+-"],
  "zoom.reset": ["Ctrl+0"],
};

/** Shortcuts that Windows keeps for itself. An app that takes them breaks the system. */
const reservedByWindows = [
  "Alt+F4",
  "Alt+Space",
  "Alt+Tab",
  "Alt+Escape",
  "Ctrl+Escape",
  "Ctrl+Shift+Escape",
  "Ctrl+Alt+Delete",
  "Alt+Shift+Tab",
];

const allShortcuts = commandDefinitions.flatMap((command) =>
  command.shortcuts.map((shortcut) => ({ id: command.id, shortcut })),
);

describe("the default shortcuts", () => {
  it("are the ones in the plan", () => {
    const actual = Object.fromEntries(
      commandDefinitions.map((command) => [command.id, command.shortcuts]),
    );

    for (const [id, shortcuts] of Object.entries(planned)) {
      expect(actual[id], id).toEqual(shortcuts);
    }
  });

  it("belong to commands with unique ids", () => {
    const ids = commandDefinitions.map((command) => command.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("are each used by one command only", () => {
    const written = allShortcuts.map(({ shortcut }) => shortcut.toLowerCase());

    expect(new Set(written).size).toBe(written.length);
  });

  it("never use Ctrl+Alt with a letter, which is how Windows types characters on many layouts (AltGr)", () => {
    for (const { id, shortcut } of allShortcuts) {
      const parsed = parseShortcut(shortcut);
      expect(parsed.ctrl && parsed.alt, `${id}: ${shortcut}`).toBe(false);
    }
  });

  it("never use a key Windows reserves", () => {
    const reserved = reservedByWindows.map((shortcut) => shortcut.toLowerCase());

    for (const { id, shortcut } of allShortcuts) {
      expect(reserved, `${id}: ${shortcut}`).not.toContain(shortcut.toLowerCase());
    }
  });

  it("never use the Windows key", () => {
    for (const { shortcut } of allShortcuts) {
      expect(shortcut.toLowerCase()).not.toMatch(/\b(win|meta|cmd)\b/);
    }
  });

  it("can each be matched by pressing the keys they name", () => {
    for (const { id, shortcut } of allShortcuts) {
      const parsed = parseShortcut(shortcut);
      const key = parsed.key.length === 1 ? parsed.key : (shortcut.split("+").pop() ?? "");
      const press = {
        key,
        code: "",
        ctrlKey: parsed.ctrl,
        altKey: parsed.alt,
        shiftKey: parsed.shift,
        metaKey: false,
        isComposing: false,
      };

      expect(matchesShortcut(press, parsed), `${id}: ${shortcut}`).toBe(true);
    }
  });
});

describe("every command", () => {
  it("has a label in the language file", () => {
    const strings: object = resources["en-US"].translation.commands;

    for (const command of commandDefinitions) {
      const name = command.labelKey.slice("commands.".length);
      expect(Reflect.get(strings, name), command.id).toBeTruthy();
    }
  });
});
