/**
 * Keyboard shortcuts: how they are written, shown and matched (plan section 6.4).
 *
 * A shortcut is written like `Ctrl+Shift+P`, `Alt+ArrowLeft` or `F11`. It matches the character the
 * key types. Only when the key types something that is not ASCII, as on a Russian or Greek layout,
 * does it fall back to the key's position on the keyboard, so Ctrl+K stays where a person expects it.
 */

export interface ParsedShortcut {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Lower case: a letter, a punctuation mark, or the name of a key such as `arrowleft` or `f11`. */
  key: string;
}

const modifierNames = ["ctrl", "alt", "shift"] as const;

export function parseShortcut(text: string): ParsedShortcut {
  const parts = text.split("+");
  const key = parts.pop()?.toLowerCase() ?? "";
  if (key === "" || (modifierNames as readonly string[]).includes(key)) {
    throw new Error(`"${text}" is not a shortcut: it has no key`);
  }
  const modifiers = new Set<string>();
  for (const part of parts) {
    const modifier = part.toLowerCase();
    if (!(modifierNames as readonly string[]).includes(modifier)) {
      throw new Error(`"${text}" is not a shortcut: "${part}" is not a modifier`);
    }
    modifiers.add(modifier);
  }
  return {
    ctrl: modifiers.has("ctrl"),
    alt: modifiers.has("alt"),
    shift: modifiers.has("shift"),
    key,
  };
}

/** The keyboard event properties that matching looks at, so tests need not build whole events. */
export interface KeyPress {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
}

const punctuationCodes: Record<string, string> = {
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  ";": "Semicolon",
  "'": "Quote",
  "[": "BracketLeft",
  "]": "BracketRight",
  "\\": "Backslash",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
};

/** Where a character's key sits on a US keyboard, as `KeyboardEvent.code` names it. */
function positionOf(character: string): string | undefined {
  if (/^[a-z]$/.test(character)) return `Key${character.toUpperCase()}`;
  if (/^[0-9]$/.test(character)) return `Digit${character}`;
  return punctuationCodes[character];
}

/** The character on a US keyboard at a position: the reverse of `positionOf`. */
function characterAt(code: string): string | undefined {
  const letter = /^Key([A-Z])$/.exec(code)?.[1];
  if (letter) return letter;
  const digit = /^Digit([0-9])$/.exec(code)?.[1];
  if (digit) return digit;
  return Object.entries(punctuationCodes).find(([, position]) => position === code)?.[0];
}

const isAscii = (text: string) =>
  Array.from(text).every((character) => (character.codePointAt(0) ?? 0) <= 0x7f);

/**
 * "Ctrl+=" is also Ctrl and the plus sign, which is what zooming in means to most people. The plus
 * is Shift and the equals key on most layouts, and its own key on the number pad.
 */
const isPlusForEquals = (event: KeyPress, shortcut: ParsedShortcut) =>
  shortcut.key === "=" && event.key === "+";

export function matchesShortcut(event: KeyPress, shortcut: ParsedShortcut): boolean {
  // A character being composed (an accent, an input method) is not a shortcut.
  if (event.isComposing || event.metaKey) return false;
  // The modifiers must be exactly the ones named. Windows reports AltGr as Ctrl and Alt together, so
  // AltGr typing a character never matches a shortcut that names only Ctrl or only Alt.
  const plusForEquals = isPlusForEquals(event, shortcut);
  if (
    event.ctrlKey !== shortcut.ctrl ||
    event.altKey !== shortcut.alt ||
    (event.shiftKey !== shortcut.shift && !plusForEquals)
  ) {
    return false;
  }

  const typed = event.key === " " ? "space" : event.key.toLowerCase();
  if (typed === shortcut.key || plusForEquals) return true;
  // Keys with names (arrows, function keys, the space bar) are the same on every layout.
  if (shortcut.key.length > 1) return false;
  // Shift changes the symbol a number or punctuation key types ("1" becomes "!"), so a shortcut
  // that names Shift and such a key is found by the key's position.
  if (shortcut.shift && !/^[a-z]$/.test(shortcut.key)) {
    return event.code === positionOf(shortcut.key);
  }
  // The character typed is not ASCII, so this is a non-Latin layout: use the key's position.
  return !isAscii(event.key) && event.code === positionOf(shortcut.key);
}

const keyLabels: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
};

/** A shortcut as it is shown to people: modifiers in the order Windows lists them. */
export function formatShortcut(text: string): string {
  const { ctrl, alt, shift } = parseShortcut(text);
  const key = text.split("+").pop() ?? "";
  const label = keyLabels[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  return [ctrl ? "Ctrl" : undefined, alt ? "Alt" : undefined, shift ? "Shift" : undefined, label]
    .filter((part) => part !== undefined)
    .join("+");
}

const modifierKeys = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "AltGraph",
  "OS",
  "Dead",
  "Unidentified",
  "Process",
]);

/**
 * The shortcut for the keys that were just pressed, or nothing when they are not a shortcut yet:
 * a modifier on its own, a dead key, a character being composed, the Windows key (which Windows
 * keeps for itself) or a key that cannot be written.
 */
export function shortcutFromEvent(event: KeyPress): string | undefined {
  if (event.isComposing || event.metaKey || modifierKeys.has(event.key)) return undefined;

  let key: string;
  if (event.key === " ") {
    key = "Space";
  } else if (event.key.length === 1) {
    // Shift turns 1 into ! and a non-Latin layout types other letters: name the key by its place.
    const place = characterAt(event.code);
    key = place && (event.shiftKey || !isAscii(event.key)) ? place : event.key.toUpperCase();
  } else {
    key = event.key;
  }
  if (key === "+") return undefined;

  return [
    event.ctrlKey ? "Ctrl" : undefined,
    event.altKey ? "Alt" : undefined,
    event.shiftKey ? "Shift" : undefined,
    key,
  ]
    .filter((part) => part !== undefined)
    .join("+");
}

/** Why a shortcut cannot be used. */
export type ShortcutProblem = "reserved" | "editing" | "altgr" | "needsModifier";

/** Shortcuts Windows keeps for itself. An app that takes them breaks the system. */
const reservedByWindows = new Set([
  "alt+f4",
  "alt+space",
  "alt+tab",
  "alt+escape",
  "ctrl+escape",
  "ctrl+shift+escape",
  "alt+shift+tab",
  "shift+f10",
]);

/** Shortcuts every text field needs for editing. */
const editing = new Set(["c", "x", "v", "a", "z", "y"]);

/** Keys that are typed, so a shortcut needs Ctrl or Alt with them. */
const isFunctionKey = (key: string) => /^f([1-9]|1[0-9]|2[0-4])$/.test(key);

/**
 * Whether a shortcut may be used, and if not, why. It applies the same rules as the defaults (see
 * plan section 6.4): no Ctrl+Alt (AltGr), nothing Windows keeps, nothing that edits text, and a
 * modifier so that typing is left alone.
 */
export function checkShortcut(text: string): ShortcutProblem | undefined {
  const { ctrl, alt, key } = parseShortcut(text);
  if (ctrl && alt) return "altgr";
  if (reservedByWindows.has(text.toLowerCase())) return "reserved";
  if (ctrl && !alt && editing.has(key)) return "editing";
  if (!ctrl && !alt && !isFunctionKey(key)) return "needsModifier";
  return undefined;
}
