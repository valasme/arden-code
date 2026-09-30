import { formatShortcut, matchesShortcut, parseShortcut } from "./shortcuts";

/** The parts of a keyboard event that shortcuts look at. */
function press(
  key: string,
  code: string,
  modifiers: Partial<
    Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "isComposing", boolean>
  > = {},
) {
  return {
    key,
    code,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
    ...modifiers,
  };
}

describe("parseShortcut", () => {
  it("reads modifiers and a key", () => {
    expect(parseShortcut("Ctrl+Shift+P")).toEqual({
      ctrl: true,
      alt: false,
      shift: true,
      key: "p",
    });
    expect(parseShortcut("Alt+ArrowLeft")).toEqual({
      ctrl: false,
      alt: true,
      shift: false,
      key: "arrowleft",
    });
    expect(parseShortcut("F11")).toEqual({ ctrl: false, alt: false, shift: false, key: "f11" });
    expect(parseShortcut("Ctrl+,")).toEqual({ ctrl: true, alt: false, shift: false, key: "," });
    expect(parseShortcut("Ctrl+/")).toEqual({ ctrl: true, alt: false, shift: false, key: "/" });
  });

  it("rejects text that is not a shortcut", () => {
    expect(() => parseShortcut("")).toThrow(/no key/);
    expect(() => parseShortcut("Ctrl+")).toThrow(/no key/);
    expect(() => parseShortcut("Ctrl+Shift")).toThrow(/no key/);
  });
});

describe("matchesShortcut", () => {
  const ctrlK = parseShortcut("Ctrl+K");

  it("matches the character the key types, in any case", () => {
    expect(matchesShortcut(press("k", "KeyK", { ctrlKey: true }), ctrlK)).toBe(true);
    expect(matchesShortcut(press("K", "KeyK", { ctrlKey: true }), ctrlK)).toBe(true);
  });

  it("needs exactly the modifiers the shortcut names", () => {
    expect(matchesShortcut(press("k", "KeyK"), ctrlK)).toBe(false);
    expect(matchesShortcut(press("k", "KeyK", { ctrlKey: true, shiftKey: true }), ctrlK)).toBe(
      false,
    );
    expect(matchesShortcut(press("k", "KeyK", { ctrlKey: true, metaKey: true }), ctrlK)).toBe(
      false,
    );
    expect(
      matchesShortcut(
        press("p", "KeyP", { ctrlKey: true, shiftKey: true }),
        parseShortcut("Ctrl+Shift+P"),
      ),
    ).toBe(true);
    expect(
      matchesShortcut(press("p", "KeyP", { ctrlKey: true }), parseShortcut("Ctrl+Shift+P")),
    ).toBe(false);
  });

  it("goes by the typed character first, so other Latin layouts keep their letters", () => {
    // On a Dvorak keyboard the key labelled K sits where QWERTY has V, and types "k".
    expect(matchesShortcut(press("k", "KeyV", { ctrlKey: true }), ctrlK)).toBe(true);
    // The physical K position types "v" there, and that is not Ctrl+K.
    expect(matchesShortcut(press("v", "KeyK", { ctrlKey: true }), ctrlK)).toBe(false);
  });

  it("falls back to the key's position when a non-Latin layout types a letter that is not Latin", () => {
    expect(matchesShortcut(press("л", "KeyK", { ctrlKey: true }), ctrlK)).toBe(true); // Russian
    expect(matchesShortcut(press("κ", "KeyK", { ctrlKey: true }), ctrlK)).toBe(true); // Greek
    expect(matchesShortcut(press("ك", "KeyK", { ctrlKey: true }), ctrlK)).toBe(true); // Arabic
    // The position of a different key still does not match.
    expect(matchesShortcut(press("л", "KeyL", { ctrlKey: true }), ctrlK)).toBe(false);
  });

  it("falls back to the position for punctuation keys too", () => {
    const comma = parseShortcut("Ctrl+,");
    const slash = parseShortcut("Ctrl+/");
    expect(matchesShortcut(press(",", "Comma", { ctrlKey: true }), comma)).toBe(true);
    expect(matchesShortcut(press("б", "Comma", { ctrlKey: true }), comma)).toBe(true); // Russian
    expect(matchesShortcut(press("/", "Slash", { ctrlKey: true }), slash)).toBe(true);
  });

  it("matches keys that have names, such as arrows and function keys", () => {
    expect(
      matchesShortcut(
        press("ArrowLeft", "ArrowLeft", { altKey: true }),
        parseShortcut("Alt+ArrowLeft"),
      ),
    ).toBe(true);
    expect(matchesShortcut(press("F11", "F11"), parseShortcut("F11"))).toBe(true);
    expect(matchesShortcut(press("F11", "F11", { shiftKey: true }), parseShortcut("F11"))).toBe(
      false,
    );
  });

  it("never matches while a character is being composed", () => {
    expect(matchesShortcut(press("k", "KeyK", { ctrlKey: true, isComposing: true }), ctrlK)).toBe(
      false,
    );
  });

  it("does not mistake AltGr for a shortcut", () => {
    // Windows reports AltGr as Ctrl and Alt together. It types characters, such as "@" or "{".
    expect(
      matchesShortcut(press("q", "KeyQ", { ctrlKey: true, altKey: true }), parseShortcut("Ctrl+Q")),
    ).toBe(false);
    expect(
      matchesShortcut(press("@", "KeyQ", { ctrlKey: true, altKey: true }), parseShortcut("Ctrl+@")),
    ).toBe(false);
  });
});

describe("formatShortcut", () => {
  it("writes shortcuts the way Windows does", () => {
    expect(formatShortcut("Ctrl+K")).toBe("Ctrl+K");
    expect(formatShortcut("Ctrl+Shift+P")).toBe("Ctrl+Shift+P");
    expect(formatShortcut("Alt+ArrowLeft")).toBe("Alt+←");
    expect(formatShortcut("Alt+ArrowRight")).toBe("Alt+→");
    expect(formatShortcut("Ctrl+,")).toBe("Ctrl+,");
    expect(formatShortcut("F11")).toBe("F11");
  });
});
