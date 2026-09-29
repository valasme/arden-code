import { applyTheme, resolveTheme } from "./theme";

/** A dark-mode media query that the test can flip. */
class FakeDarkQuery extends EventTarget implements MediaQueryList {
  readonly media = "(prefers-color-scheme: dark)";
  onchange: MediaQueryList["onchange"] = null;
  matches: boolean;
  listenerCount = 0;

  constructor(dark: boolean) {
    super();
    this.matches = dark;
  }

  override addEventListener(...args: Parameters<EventTarget["addEventListener"]>) {
    this.listenerCount++;
    super.addEventListener(...args);
  }

  override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>) {
    this.listenerCount--;
    super.removeEventListener(...args);
  }

  // The deprecated listener methods are part of MediaQueryList but unused by the code under test.
  addListener() {}
  removeListener() {}

  setDark(value: boolean) {
    this.matches = value;
    this.dispatchEvent(new Event("change"));
  }
}

function fakeSystemTheme(initiallyDark: boolean) {
  const query = new FakeDarkQuery(initiallyDark);
  vi.spyOn(window, "matchMedia").mockReturnValue(query);
  return query;
}

const root = document.documentElement;
const isDark = () => root.classList.contains("dark");
const isLight = () => root.classList.contains("light");

afterEach(() => {
  vi.restoreAllMocks();
  root.classList.remove("dark", "light");
});

describe("resolveTheme", () => {
  it("uses the chosen theme, or the system's when the mode is system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("applyTheme", () => {
  it("applies an explicit light or dark theme to the page", () => {
    fakeSystemTheme(false);

    applyTheme("dark");
    expect([isDark(), isLight()]).toEqual([true, false]);

    applyTheme("light");
    expect([isDark(), isLight()]).toEqual([false, true]);
  });

  it("follows the Windows setting, and switches live when it changes", () => {
    const system = fakeSystemTheme(true);

    applyTheme("system");
    expect(isDark()).toBe(true);

    system.setDark(false);
    expect([isDark(), isLight()]).toEqual([false, true]);

    system.setDark(true);
    expect([isDark(), isLight()]).toEqual([true, false]);
  });

  it("ignores Windows changes when a theme is chosen explicitly", () => {
    const system = fakeSystemTheme(false);

    applyTheme("light");
    system.setDark(true);

    expect(isDark()).toBe(false);
  });

  it("stops listening when the returned function is called", () => {
    const system = fakeSystemTheme(false);

    const stop = applyTheme("system");
    expect(system.listenerCount).toBe(1);
    stop();

    expect(system.listenerCount).toBe(0);
    system.setDark(true);
    expect(isDark()).toBe(false);
  });
});
