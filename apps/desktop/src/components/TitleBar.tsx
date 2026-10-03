import { isTauri } from "@tauri-apps/api/core";
import { ArrowLeftIcon, ArrowRightIcon, MenuIcon, SearchIcon } from "lucide-react";
import { type ComponentProps, type MouseEvent, type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { commands } from "@/ipc/bindings";
import { reportFailure } from "@/lib/errorToasts";
import { useSnapLayouts } from "@/lib/snapLayouts";
import { cn } from "@/lib/utils";
import { useWindowMaximized, windowControls } from "@/lib/useWindowControls";

import { Kbd } from "@/components/ui/kbd";
import { CommandTooltip } from "@/features/commands/CommandTooltip";
import { useShortcutsOf } from "@/features/commands/CommandsProvider";
import { formatShortcut } from "@/features/commands/shortcuts";

import { Mark } from "./brand/Logo";
import { CloseGlyph, MaximizeGlyph, MinimizeGlyph, RestoreGlyph } from "./WindowIcons";

interface TitleBarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  /** Opens the command palette. */
  onSearch: () => void;
  /** Windows draws the title bar's frame, its window buttons and its menu, so the bar keeps only what is the app's. */
  native?: boolean;
  /** Drawn before the window buttons: the layout controls (ADR 0033). */
  controls?: ReactNode;
}

function showSystemMenu() {
  if (!isTauri()) return;
  commands.showSystemMenu().catch((error: unknown) => {
    reportFailure("Opening the window menu", error);
  });
}

/** A button in the bar: 32 px high, with Windows-like hover and pressed states. */
export function BarButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "grid h-8 place-items-center text-foreground hover:bg-muted active:bg-border disabled:pointer-events-none disabled:opacity-40 forced-colors:hover:outline forced-colors:hover:outline-1",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The window's title bar, drawn by the app: the logo, the window menu, back and forward, the search
 * field that opens the command palette, and the window buttons. Empty space and the logo drag the
 * window, and a double click on them maximizes or restores it, both handled by Tauri's drag region.
 */
export function TitleBar({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onSearch,
  native = false,
  controls,
}: TitleBarProps) {
  const { t } = useTranslation();
  const maximized = useWindowMaximized();
  const maximizeButton = useRef<HTMLButtonElement>(null);
  const maximizeLook = useSnapLayouts(maximizeButton, !native);
  const [paletteShortcut] = useShortcutsOf("palette.open");

  // Alt+Space opens the system menu, as in every Windows app. With the title bar of Windows,
  // Windows does it.
  useEffect(() => {
    if (native) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.metaKey &&
        event.code === "Space"
      ) {
        event.preventDefault();
        showSystemMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [native]);

  // A right click on the bar's empty space also opens it.
  const onContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (!native && event.target === event.currentTarget) {
      event.preventDefault();
      showSystemMenu();
    }
  };

  return (
    <header
      data-area="titlebar"
      {...(native ? {} : { "data-tauri-drag-region": true })}
      onContextMenu={onContextMenu}
      className="@container flex h-8 shrink-0 items-stretch gap-1 border-b border-border bg-background pl-1 text-foreground select-none"
    >
      {native ? null : (
        <>
          {/* Only the logo (ADR 0034): a press on it lands on the bar, as on its empty space. */}
          <div className="pointer-events-none grid w-8 shrink-0 place-items-center">
            <Mark className="size-4" />
          </div>
          <BarButton
            aria-label={t("titleBar.menu")}
            aria-haspopup="menu"
            className="w-8"
            onClick={showSystemMenu}
          >
            <MenuIcon aria-hidden className="size-5" strokeWidth={1.5} />
          </BarButton>
        </>
      )}

      <CommandTooltip command="navigate.back">
        <BarButton
          aria-label={t("titleBar.back")}
          className="w-8"
          disabled={!canGoBack}
          onClick={onBack}
        >
          <ArrowLeftIcon aria-hidden className="size-5" strokeWidth={1.5} />
        </BarButton>
      </CommandTooltip>
      <CommandTooltip command="navigate.forward">
        <BarButton
          aria-label={t("titleBar.forward")}
          className="w-8"
          disabled={!canGoForward}
          onClick={onForward}
        >
          <ArrowRightIcon aria-hidden className="size-5" strokeWidth={1.5} />
        </BarButton>
      </CommandTooltip>

      {/* A quiet strip, not a form field: it opens the command palette (ADR 0032). */}
      <button
        type="button"
        onClick={onSearch}
        className="mx-auto my-1 flex max-w-md min-w-0 flex-1 items-center gap-2 bg-muted px-2.5 text-xs text-muted-foreground hover:bg-border hover:text-foreground forced-colors:border forced-colors:border-[ButtonBorder]"
      >
        <SearchIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
        <span className="truncate">{t("titleBar.search")}</span>
        {paletteShortcut ? (
          <Kbd className="ms-auto h-4 border-0 bg-transparent px-0 text-muted-foreground">
            {formatShortcut(paletteShortcut)}
          </Kbd>
        ) : null}
      </button>

      {/* They step aside when the bar is too narrow for them, so the window buttons (3 × 46 px) stay
          on screen in a small window at a high zoom. Their commands stay in the palette. */}
      {controls ? <div className="hidden @min-[calc(20rem+138px)]:flex">{controls}</div> : null}

      {/* The window buttons keep the arrow, as Windows' own do (ADR 0037); every other control in
          the bar shows the pointer. */}
      {native ? null : (
        <div className="flex">
          <BarButton
            aria-label={t("titleBar.minimize")}
            className="w-[46px] cursor-default"
            onClick={() => void windowControls.minimize()}
          >
            <MinimizeGlyph />
          </BarButton>
          {/* Under Rust's Snap Layouts overlay, which takes the pointer and says how to look. */}
          <BarButton
            ref={maximizeButton}
            data-look={maximizeLook}
            aria-label={maximized ? t("titleBar.restore") : t("titleBar.maximize")}
            className="w-[46px] cursor-default data-[look=hover]:bg-muted data-[look=pressed]:bg-border forced-colors:data-[look=hover]:outline forced-colors:data-[look=hover]:outline-1"
            onClick={() => void windowControls.toggleMaximize()}
          >
            {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
          </BarButton>
          {/* Windows' Close turns red; white on #C42B1C is 5.9:1. */}
          <BarButton
            aria-label={t("titleBar.close")}
            className="w-[46px] cursor-default hover:bg-[#c42b1c] hover:text-white active:bg-[#b32b1c] active:text-white"
            onClick={() => void windowControls.close()}
          >
            <CloseGlyph />
          </BarButton>
        </div>
      )}
    </header>
  );
}
