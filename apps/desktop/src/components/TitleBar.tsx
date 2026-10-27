import { isTauri } from "@tauri-apps/api/core";
import { ArrowLeftIcon, ArrowRightIcon, MenuIcon, SearchIcon } from "lucide-react";
import { type ComponentProps, type MouseEvent, type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { commands, type PagePoint } from "@/ipc/bindings";
import { reportFailure } from "@/lib/errorToasts";
import { currentPlatform, type Platform } from "@/lib/platform";
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
  /** The system draws the title bar's frame, its window buttons and its menu, so the bar keeps only what is the app's. */
  native?: boolean;
  /** Drawn before the window buttons: the layout controls (ADR 0033). */
  controls?: ReactNode;
  /**
   * The frame follows the platform (ADR 0060): Windows' caption, with its window menu and Snap
   * Layouts, or on Linux plain window buttons, as the desktop owns the window's menu and place.
   */
  platform?: Platform;
}

/**
 * Opens Windows' own window menu: with its top left corner at a point of the page, or, with none,
 * where Windows puts it for Alt+Space.
 */
function showSystemMenu(at: PagePoint | null = null) {
  if (!isTauri()) return;
  commands.showSystemMenu(at).catch((error: unknown) => {
    reportFailure("Opening the window menu", error);
  });
}

/** A button in the bar: 32 px high, with Windows-like hover and pressed states. */
export function BarButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "grid h-8 place-items-center text-foreground hover:bg-muted active:bg-border disabled:pointer-events-none disabled:opacity-40",
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
  platform = currentPlatform(),
}: TitleBarProps) {
  const { t } = useTranslation();
  const maximized = useWindowMaximized();
  const maximizeButton = useRef<HTMLButtonElement>(null);
  // Windows' caption: its window menu and Snap Layouts. Linux has neither in a bar the app draws.
  const caption = !native && platform === "windows";
  const maximizeLook = useSnapLayouts(maximizeButton, caption);
  const [paletteShortcut] = useShortcutsOf("palette.open");

  // Alt+Space opens the system menu, as in every Windows app. With the title bar of Windows,
  // Windows does it, and on Linux the desktop does what it does with it.
  useEffect(() => {
    if (!caption) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.metaKey &&
        event.code === "Space"
      ) {
        event.preventDefault();
        showSystemMenu(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [caption]);

  // A right click on the bar's empty space also opens it, at the pointer, as on a bar Windows draws.
  const onContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (caption && event.target === event.currentTarget) {
      event.preventDefault();
      showSystemMenu({ x: event.clientX, y: event.clientY });
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
          {caption ? (
            <BarButton
              aria-label={t("titleBar.menu")}
              aria-haspopup="menu"
              className="w-8"
              onClick={(event) => {
                // Under the button, as a menu button opens its menu.
                const button = event.currentTarget.getBoundingClientRect();
                showSystemMenu({ x: button.left, y: button.bottom });
              }}
            >
              <MenuIcon aria-hidden className="size-5" strokeWidth={1.5} />
            </BarButton>
          ) : null}
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
        className="@container/search mx-auto my-1 flex max-w-md min-w-0 flex-1 items-center gap-2 rounded-md bg-muted px-2.5 text-xs text-muted-foreground hover:bg-border hover:text-foreground"
      >
        <SearchIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
        {/* All of it or none of it: a narrow strip shows only the icon and the shortcut, and keeps
            the words for assistive technology (#128). */}
        <span className="sr-only whitespace-nowrap @min-[15rem]/search:not-sr-only">
          {t("titleBar.search")}
        </span>
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
      {!native && platform === "linux" ? (
        // Linux: the desktop's usual three buttons, square as the bar's own and quiet as GTK's,
        // with no Snap Layouts and no red Close (ADR 0060).
        <div className="flex">
          <BarButton
            aria-label={t("titleBar.minimize")}
            className="w-8 cursor-default"
            onClick={() => void windowControls.minimize()}
          >
            <MinimizeGlyph />
          </BarButton>
          <BarButton
            aria-label={maximized ? t("titleBar.restore") : t("titleBar.maximize")}
            className="w-8 cursor-default"
            onClick={() => void windowControls.toggleMaximize()}
          >
            {maximized ? <RestoreGlyph /> : <MaximizeGlyph />}
          </BarButton>
          <BarButton
            aria-label={t("titleBar.close")}
            className="w-8 cursor-default"
            onClick={() => void windowControls.close()}
          >
            <CloseGlyph />
          </BarButton>
        </div>
      ) : null}
      {caption ? (
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
            className="w-[46px] cursor-default data-[look=hover]:bg-muted data-[look=pressed]:bg-border"
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
      ) : null}
    </header>
  );
}
