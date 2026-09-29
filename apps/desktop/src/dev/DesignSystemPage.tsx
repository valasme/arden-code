import { CopyIcon, FolderIcon, SearchIcon, SettingsIcon, TerminalIcon } from "lucide-react";
import { useEffect } from "react";

import { Logo, Mark, Wordmark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { applyTheme, type ThemeMode } from "@/lib/theme";

import { colorTokens, textSamples, typeScale } from "./tokens";

export const themeChoices = ["system", "light", "dark"] as const satisfies readonly ThemeMode[];
export const zoomChoices = [1, 1.5, 2] as const;
export type Zoom = (typeof zoomChoices)[number];

const icons = [FolderIcon, SearchIcon, SettingsIcon, TerminalIcon, CopyIcon];

interface DesignSystemPageProps {
  theme: ThemeMode;
  zoom: Zoom;
  onThemeChange: (theme: ThemeMode) => void;
  onZoomChange: (zoom: Zoom) => void;
}

/**
 * Shows every design token, the type scale, fonts, focus, controls and brand assets. Development
 * builds only: it stands in for a Figma library and is the target of the screenshot tests.
 */
export function DesignSystemPage({
  theme,
  zoom,
  onThemeChange,
  onZoomChange,
}: DesignSystemPageProps) {
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    document.documentElement.style.zoom = String(zoom);
    return () => {
      document.documentElement.style.zoom = "";
    };
  }, [zoom]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Design system</h1>
        <div className="flex flex-wrap gap-6">
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">Theme</legend>
            {themeChoices.map((choice) => (
              <Button
                key={choice}
                size="sm"
                variant={theme === choice ? "default" : "outline"}
                aria-pressed={theme === choice}
                onClick={() => {
                  onThemeChange(choice);
                }}
              >
                {choice}
              </Button>
            ))}
          </fieldset>
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">Zoom</legend>
            {zoomChoices.map((choice) => (
              <Button
                key={choice}
                size="sm"
                variant={zoom === choice ? "default" : "outline"}
                aria-pressed={zoom === choice}
                onClick={() => {
                  onZoomChange(choice);
                }}
              >
                {choice * 100}%
              </Button>
            ))}
          </fieldset>
        </div>
      </header>

      <section aria-labelledby="ds-colors" className="flex flex-col gap-4">
        <h2 id="ds-colors" className="text-lg font-semibold">
          Colors
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {colorTokens.map((token) => (
            <li key={token} className="flex flex-col gap-1">
              <div
                className="h-10 border border-border"
                style={{ background: `var(--${token})` }}
                aria-hidden
              />
              <code className="text-2xs">--{token}</code>
            </li>
          ))}
        </ul>
        <h3 className="text-base font-semibold">Text on its surface</h3>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {textSamples.map(([text, surface]) => (
            <li
              key={`${text}-${surface}`}
              className="border border-border p-3 text-sm"
              style={{ color: `var(--${text})`, background: `var(--${surface})` }}
            >
              <span className="block font-medium">Aa The quick brown fox</span>
              <code className="text-2xs">
                {text} on {surface}
              </code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ds-type" className="flex flex-col gap-4">
        <h2 id="ds-type" className="text-lg font-semibold">
          Type
        </h2>
        <ul className="flex flex-col gap-2">
          {typeScale.map(([name, className, note]) => (
            <li key={name} className="flex items-baseline gap-4">
              <code className="w-14 shrink-0 text-2xs text-muted-foreground">{name}</code>
              <span className={className}>Arden Code runs your coding agents</span>
              <span className="text-2xs text-muted-foreground">{note}</span>
            </li>
          ))}
        </ul>
        <p className="text-base">
          Inter Variable for the interface. Numbers in tables use tabular figures:{" "}
          <span className="tabular-nums">0123456789 · 1111111111</span>
        </p>
        <pre className="border border-border bg-muted p-3 text-sm">
          <code>
            {"const isEqual = a !== b && c === d; // -> => >= <= Cascadia Code, no ligatures"}
          </code>
        </pre>
      </section>

      <section aria-labelledby="ds-controls" className="flex flex-col gap-4">
        <h2 id="ds-controls" className="text-lg font-semibold">
          Controls and focus
        </h2>
        <p className="text-sm text-muted-foreground">
          Press Tab to move focus. It shows a 1px outline for the keyboard only; clicking with the
          mouse shows none.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">Extra small</Button>
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
        </div>
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          A text field
          <input
            className="h-8 border border-input bg-background px-2.5 text-sm"
            defaultValue="Control borders are 3:1"
          />
        </label>
      </section>

      <section aria-labelledby="ds-icons" className="flex flex-col gap-4">
        <h2 id="ds-icons" className="text-lg font-semibold">
          Icons
        </h2>
        <div className="flex items-center gap-4">
          {icons.map((Icon) => (
            <Icon
              key={Icon.displayName ?? Icon.name}
              aria-hidden
              className="size-4"
              strokeWidth={1.5}
            />
          ))}
          <span className="text-2xs text-muted-foreground">16 px, 1.5 stroke</span>
          <SettingsIcon aria-hidden className="size-5" strokeWidth={1.5} />
          <span className="text-2xs text-muted-foreground">20 px in the title bar</span>
        </div>
      </section>

      <section aria-labelledby="ds-brand" className="flex flex-col gap-4">
        <h2 id="ds-brand" className="text-lg font-semibold">
          Brand
        </h2>
        <div className="flex flex-wrap items-center gap-8">
          <Logo className="h-12" />
          <Logo orientation="stacked" className="h-24" />
          <Mark className="h-12" />
          <Wordmark className="h-8" />
        </div>
      </section>
    </main>
  );
}
