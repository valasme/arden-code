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

  const typed = event.key.toLowerCase();
  if (typed === shortcut.key || plusForEquals) return true;
  // Keys with names (arrows, function keys) are the same on every layout.
  if (shortcut.key.length > 1) return false;
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
