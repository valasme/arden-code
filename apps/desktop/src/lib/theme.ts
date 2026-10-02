export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const darkQuery = "(prefers-color-scheme: dark)";

export function resolveTheme(mode: ThemeMode, systemIsDark: boolean): ResolvedTheme {
  if (mode === "system") return systemIsDark ? "dark" : "light";
  return mode;
}

function paint(theme: ResolvedTheme) {
  const classes = document.documentElement.classList;
  classes.toggle("dark", theme === "dark");
  classes.toggle("light", theme === "light");
}

/**
 * Puts the theme on the page, now and (in system mode) whenever the Windows setting changes.
 * Returns a function that stops following the system.
 */
export function applyTheme(mode: ThemeMode = "system"): () => void {
  const system = window.matchMedia(darkQuery);
  paint(resolveTheme(mode, system.matches));

  if (mode !== "system") return () => {};

  const onChange = () => {
    paint(resolveTheme(mode, system.matches));
  };
  system.addEventListener("change", onChange);
  return () => {
    system.removeEventListener("change", onChange);
  };
}
