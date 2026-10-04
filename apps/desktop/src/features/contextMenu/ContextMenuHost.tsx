import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSessionDialogsStore } from "@/state/sessionDialogs";
import { ProjectMenuItems } from "@/features/sessions/ProjectActions";
import { SessionMenuItems } from "@/features/sessions/SessionMenu";
import { findSession } from "@/features/sessions/sessionList";
import { type SessionAction, useSessionActions } from "@/features/sessions/useSessionActions";
import { useSettings } from "@/features/settings/useSettings";
import { noSessions, sessionListQuery } from "@/ipc/queries";
import { logger } from "@/lib/logger";

import { readClipboard, writeClipboard } from "./clipboard";
import {
  menuStateOf,
  menuTargetOf,
  selectedTextIn,
  type MenuState,
  type MenuTarget,
} from "./targets";

type Action = "cut" | "copy" | "paste" | "selectAll";

interface OpenMenu {
  x: number;
  y: number;
  target: MenuTarget;
  /** The text that was selected when the menu opened: choosing an item can clear the selection. */
  text: string;
  state: MenuState;
  /** Opened from the keyboard, so the first item is highlighted like in a menu of Windows. */
  viaKeyboard: boolean;
}

function openMenu(target: MenuTarget, x: number, y: number, viaKeyboard: boolean): OpenMenu {
  return { x, y, target, text: selectedTextIn(target), state: menuStateOf(target), viaKeyboard };
}

/** Runs one of the menu's actions on its target. */
async function run(action: Action, { target, text }: Pick<OpenMenu, "target" | "text">) {
  switch (action) {
    case "copy": {
      await writeClipboard(text);
      break;
    }
    case "cut": {
      await writeClipboard(text);
      document.execCommand("delete");
      break;
    }
    case "paste": {
      document.execCommand("insertText", false, await readClipboard());
      break;
    }
    case "selectAll": {
      if (target.kind === "field") target.element.select();
      else document.execCommand("selectAll");
      break;
    }
  }
}

const isInsideMenu = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[role="menu"]') !== null;

/**
 * The app's own context menus, opened with a right click, Shift+F10 or the Menu key: cut, copy,
 * paste and select all in text fields, copy for selected text, a session's own menu on its row
 * in the sidebar (ADR 0036), and a folder project's own menu on its name (#72). Draws the menu; put it once in the window.
 *
 * In a release build the browser's own menu never shows: where this has nothing to offer, the
 * right click does nothing.
 */
export function ContextMenuHost() {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  // What the person chose, run once the menu has closed and the text has its focus back.
  const chosen = useRef<Action | undefined>(undefined);
  // The same for a session's menu: a dialog it opens gives the focus back to the row.
  const chosenForSession = useRef<SessionAction | undefined>(undefined);
  // And for a project's menu: Remove project… asks once the focus is back.
  const removeChosen = useRef(false);
  const askToRemove = useSessionDialogsStore((state) => state.askToRemove);
  const runSessionAction = useSessionActions();
  const { data: sessionList = noSessions } = useQuery(sessionListQuery);
  const content = useRef<HTMLDivElement>(null);
  // In developer mode the browser's own menu (with Inspect) stays available.
  const { developerMode } = useSettings().advanced;
  const developing = useRef(developerMode);
  useEffect(() => {
    developing.current = developerMode;
  }, [developerMode]);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (isInsideMenu(event.target)) {
        event.preventDefault();
        return;
      }
      const target = menuTargetOf(event.target);
      // The browser's own menu has "Inspect", which developers want.
      if (!target && (!import.meta.env.PROD || developing.current)) return;
      event.preventDefault();
      if (!target) return;
      returnFocusTo.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMenu(openMenu(target, event.clientX, event.clientY, false));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const isMenuKey = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
      if (!isMenuKey || event.ctrlKey || event.altKey || isInsideMenu(event.target)) return;
      event.preventDefault();
      const focused = document.activeElement;
      const target = menuTargetOf(focused);
      if (!target || !(focused instanceof HTMLElement)) return;
      returnFocusTo.current = focused;
      const box = focused.getBoundingClientRect();
      setMenu(openMenu(target, box.left + 8, box.bottom, true));
    };

    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  // A menu opened from the keyboard starts on its first item, like a menu of Windows. The menu
  // moves the focus to itself as it opens, so this waits for that.
  const viaKeyboard = menu?.viaKeyboard === true;
  useEffect(() => {
    if (!viaKeyboard) return undefined;
    const frame = requestAnimationFrame(() => {
      content.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')
        ?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [viaKeyboard]);

  const choose = (action: Action) => {
    chosen.current = action;
  };

  if (!menu) return null;
  const { state } = menu;

  return (
    <DropdownMenu
      modal={false}
      open
      onOpenChange={(next) => {
        if (!next) setMenu(undefined);
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{ position: "fixed", left: menu.x, top: menu.y, width: 0, height: 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={content}
        align="start"
        className={
          menu.target.kind === "session" || menu.target.kind === "project"
            ? "w-auto min-w-48"
            : undefined
        }
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // The text is edited where the person was, not in the menu.
          returnFocusTo.current?.focus();
          const forSession = chosenForSession.current;
          chosenForSession.current = undefined;
          if (removeChosen.current && menu.target.kind === "project") {
            removeChosen.current = false;
            askToRemove(menu.target.projectId);
          }
          if (forSession && menu.target.kind === "session") {
            runSessionAction(forSession, menu.target.sessionId, true);
          }
          const action = chosen.current;
          chosen.current = undefined;
          if (!action) return;
          run(action, menu).catch((error: unknown) => {
            logger.error("contextMenu", `${action} failed: ${String(error)}`);
          });
        }}
      >
        {menu.target.kind === "project" ? (
          <ProjectMenuItems
            onRemove={() => {
              removeChosen.current = true;
            }}
          />
        ) : menu.target.kind === "session" ? (
          <SessionMenuItems
            session={findSession(sessionList, menu.target.sessionId)}
            onChoose={(action) => {
              chosenForSession.current = action;
            }}
          />
        ) : (
          <>
            {menu.target.kind !== "selection" ? (
              <DropdownMenuItem
                disabled={!state.cut}
                onSelect={() => {
                  choose("cut");
                }}
              >
                {t("contextMenu.cut")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              disabled={!state.copy}
              onSelect={() => {
                choose("copy");
              }}
            >
              {t("contextMenu.copy")}
            </DropdownMenuItem>
            {menu.target.kind !== "selection" ? (
              <>
                <DropdownMenuItem
                  disabled={!state.paste}
                  onSelect={() => {
                    choose("paste");
                  }}
                >
                  {t("contextMenu.paste")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    choose("selectAll");
                  }}
                >
                  {t("contextMenu.selectAll")}
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
