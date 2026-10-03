import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { useShortcutsOf } from "@/features/commands/CommandsProvider";
import { type CommandId, definitionOf } from "@/features/commands/registry";
import { formatShortcut } from "@/features/commands/shortcuts";
import type { SessionSummary } from "@/ipc/bindings";
import { noSessions, sessionListQuery } from "@/ipc/queries";

import { findSession } from "./sessionList";
import { actionsFor, type SessionAction, useSessionActions } from "./useSessionActions";

/** Each action's words in the menu, and the command that does the same for the open session. */
const items = {
  rename: { labelKey: "sessions.actions.rename", command: "session.rename" },
  pin: { labelKey: "sessions.actions.pin", command: "session.pin" },
  unpin: { labelKey: "sessions.actions.unpin", command: "session.unpin" },
  archive: { labelKey: "sessions.actions.archive", command: "session.archive" },
  unarchive: { labelKey: "sessions.actions.unarchive", command: "session.unarchive" },
  delete: { labelKey: "sessions.actions.delete", command: "session.delete" },
} as const satisfies Record<SessionAction, { labelKey: string; command: CommandId }>;

function SessionMenuItem({
  action,
  onChoose,
}: {
  action: SessionAction;
  onChoose: (action: SessionAction) => void;
}) {
  const { t } = useTranslation();
  const { labelKey, command } = items[action];
  const { icon: Icon } = definitionOf(command);
  const [shortcut] = useShortcutsOf(command);
  // Deleting cannot be undone: it stands apart, in the color of destructive actions.
  const destructive = action === "delete";

  return (
    <>
      {destructive ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        variant={destructive ? "destructive" : "default"}
        onSelect={() => {
          onChoose(action);
        }}
      >
        <Icon
          aria-hidden
          className={destructive ? "size-4" : "size-4 text-muted-foreground"}
          strokeWidth={1.5}
        />
        {t(labelKey)}
        {shortcut ? <Kbd className="ms-auto">{formatShortcut(shortcut)}</Kbd> : null}
      </DropdownMenuItem>
    </>
  );
}

/**
 * The items of a session's menu, those that apply to it now, with the shortcut of the command that
 * does the same. Choosing one only says which: whoever drew the menu runs it once the menu has
 * closed.
 */
export function SessionMenuItems({
  session,
  onChoose,
}: {
  session: SessionSummary | undefined;
  onChoose: (action: SessionAction) => void;
}) {
  if (!session) return null;
  return (
    <>
      {actionsFor(session).map((action) => (
        <SessionMenuItem key={action} action={action} onChoose={onChoose} />
      ))}
    </>
  );
}

/**
 * A session's menu, opened by the control it wraps (ADR 0036). The chosen action runs once the menu
 * has closed and the focus is back on that control, so a dialog it opens keeps the focus. The menu
 * is not modal, like the context menus (ADR 0024). `onRow` says the control is on the session's row
 * in the sidebar.
 */
export function SessionMenu({
  sessionId,
  onRow = false,
  children,
}: {
  sessionId: string;
  onRow?: boolean;
  children: ReactNode;
}) {
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const runAction = useSessionActions();
  const chosen = useRef<SessionAction | undefined>(undefined);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-48"
        onCloseAutoFocus={() => {
          const action = chosen.current;
          chosen.current = undefined;
          if (action) runAction(action, sessionId, onRow);
        }}
      >
        <SessionMenuItems
          session={findSession(list, sessionId)}
          onChoose={(action) => {
            chosen.current = action;
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
