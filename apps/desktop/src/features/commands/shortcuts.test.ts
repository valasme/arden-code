import {
  checkShortcut,
  formatShortcut,
  matchesShortcut,
  parseShortcut,
  shortcutFromEvent,
} from "./shortcuts";

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

  it("treats Ctrl and + as the zoom in shortcut too, as browsers do", () => {
    const zoomIn = parseShortcut("Ctrl+=");
    expect(matchesShortcut(press("=", "Equal", { ctrlKey: true }), zoomIn)).toBe(true);
    // The plus sign on the main keys needs Shift; on the number pad it does not.
    expect(matchesShortcut(press("+", "Equal", { ctrlKey: true, shiftKey: true }), zoomIn)).toBe(
      true,
    );
    expect(matchesShortcut(press("+", "NumpadAdd", { ctrlKey: true }), zoomIn)).toBe(true);
    expect(matchesShortcut(press("+", "Equal", { shiftKey: true }), zoomIn)).toBe(false);
    // Shift alone still changes what other shortcuts mean.
    expect(matchesShortcut(press("=", "Equal", { ctrlKey: true, shiftKey: true }), zoomIn)).toBe(
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

describe("shortcutFromEvent", () => {
  it("writes the keys that were pressed the way shortcuts are written", () => {
    expect(shortcutFromEvent(press("k", "KeyK", { ctrlKey: true }))).toBe("Ctrl+K");
    expect(shortcutFromEvent(press("P", "KeyP", { ctrlKey: true, shiftKey: true }))).toBe(
      "Ctrl+Shift+P",
    );
    expect(shortcutFromEvent(press("ArrowLeft", "ArrowLeft", { altKey: true }))).toBe(
      "Alt+ArrowLeft",
    );
    expect(shortcutFromEvent(press("F11", "F11"))).toBe("F11");
    expect(shortcutFromEvent(press(",", "Comma", { ctrlKey: true }))).toBe("Ctrl+,");
    expect(shortcutFromEvent(press(" ", "Space", { ctrlKey: true }))).toBe("Ctrl+Space");
  });

  it("names a shifted symbol by its key, not by the symbol it types", () => {
    expect(shortcutFromEvent(press("!", "Digit1", { ctrlKey: true, shiftKey: true }))).toBe(
      "Ctrl+Shift+1",
    );
    expect(shortcutFromEvent(press("+", "Equal", { ctrlKey: true, shiftKey: true }))).toBe(
      "Ctrl+Shift+=",
    );
    expect(shortcutFromEvent(press("?", "Slash", { ctrlKey: true, shiftKey: true }))).toBe(
      "Ctrl+Shift+/",
    );
  });

  it("names a key on a non-Latin layout by the Latin key in the same place", () => {
    expect(shortcutFromEvent(press("л", "KeyK", { ctrlKey: true }))).toBe("Ctrl+K");
    expect(shortcutFromEvent(press("б", "Comma", { ctrlKey: true }))).toBe("Ctrl+,");
  });

  it("gives nothing for a modifier on its own, a dead key, or a composed character", () => {
    expect(shortcutFromEvent(press("Control", "ControlLeft", { ctrlKey: true }))).toBeUndefined();
    expect(shortcutFromEvent(press("Shift", "ShiftLeft", { shiftKey: true }))).toBeUndefined();
    expect(shortcutFromEvent(press("Alt", "AltLeft", { altKey: true }))).toBeUndefined();
    expect(shortcutFromEvent(press("Meta", "MetaLeft", { metaKey: true }))).toBeUndefined();
    expect(shortcutFromEvent(press("Dead", "Quote", { ctrlKey: true }))).toBeUndefined();
    expect(
      shortcutFromEvent(press("k", "KeyK", { ctrlKey: true, isComposing: true })),
    ).toBeUndefined();
  });

  it("gives nothing when the Windows key is held, which Windows keeps for itself", () => {
    expect(shortcutFromEvent(press("k", "KeyK", { ctrlKey: true, metaKey: true }))).toBeUndefined();
  });

  it("gives nothing for the number pad plus, which cannot be written as a shortcut", () => {
    expect(shortcutFromEvent(press("+", "NumpadAdd", { ctrlKey: true }))).toBeUndefined();
  });

  it("writes something that parses back to the same keys", () => {
    for (const written of [
      "Ctrl+K",
      "Ctrl+Shift+P",
      "Alt+ArrowLeft",
      "F11",
      "Ctrl+,",
      "Ctrl+Space",
    ]) {
      expect(() => parseShortcut(written)).not.toThrow();
    }
  });
});

describe("shifted symbols in shortcuts", () => {
  it("match by the key they are on, whichever symbol Shift types", () => {
    const shiftedOne = parseShortcut("Ctrl+Shift+1");
    expect(
      matchesShortcut(press("!", "Digit1", { ctrlKey: true, shiftKey: true }), shiftedOne),
    ).toBe(true);
    expect(matchesShortcut(press("1", "Digit1", { ctrlKey: true }), shiftedOne)).toBe(false);
    expect(
      matchesShortcut(press("@", "Digit2", { ctrlKey: true, shiftKey: true }), shiftedOne),
    ).toBe(false);
    const shiftedEquals = parseShortcut("Ctrl+Shift+=");
    expect(
      matchesShortcut(press("+", "Equal", { ctrlKey: true, shiftKey: true }), shiftedEquals),
    ).toBe(true);
  });

  it("match the space bar", () => {
    expect(
      matchesShortcut(press(" ", "Space", { ctrlKey: true }), parseShortcut("Ctrl+Space")),
    ).toBe(true);
  });
});

describe("checkShortcut", () => {
  it("accepts an ordinary shortcut", () => {
    for (const shortcut of [
      "Ctrl+K",
      "Ctrl+Shift+P",
      "Alt+ArrowLeft",
      "F11",
      "Ctrl+,",
      "Ctrl+1",
      "Alt+K",
      "F6",
    ]) {
      expect(checkShortcut(shortcut), shortcut).toBeUndefined();
    }
  });

  it("refuses the keys Windows keeps for itself", () => {
    for (const shortcut of [
      "Alt+F4",
      "Alt+Space",
      "Alt+Tab",
      "Alt+Escape",
      "Ctrl+Escape",
      "Ctrl+Shift+Escape",
      "Alt+Shift+Tab",
    ]) {
      expect(checkShortcut(shortcut), shortcut).toBe("reserved");
    }
  });

  it("refuses the keys that edit text, which every text field needs", () => {
    for (const shortcut of [
      "Ctrl+C",
      "Ctrl+X",
      "Ctrl+V",
      "Ctrl+A",
      "Ctrl+Z",
      "Ctrl+Y",
      "Ctrl+Shift+Z",
    ]) {
      expect(checkShortcut(shortcut), shortcut).toBe("editing");
    }
  });

  it("refuses Ctrl and Alt together, which is how Windows types characters on many layouts", () => {
    expect(checkShortcut("Ctrl+Alt+K")).toBe("altgr");
    expect(checkShortcut("Ctrl+Alt+Shift+Q")).toBe("altgr");
  });

  it("wants Ctrl or Alt, so typing is not taken over, unless the key is a function key", () => {
    for (const shortcut of [
      "K",
      "Shift+K",
      "1",
      ",",
      "Space",
      "Enter",
      "Escape",
      "Tab",
      "ArrowLeft",
      "Shift+ArrowLeft",
    ]) {
      expect(checkShortcut(shortcut), shortcut).toBe("needsModifier");
    }
    expect(checkShortcut("F12")).toBeUndefined();
    expect(checkShortcut("Shift+F10")).toBe("reserved");
  });
});
