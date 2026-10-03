import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AppError, commands } from "@/ipc/bindings";
import { noSessions, sessionListQuery, sessionQuery } from "@/ipc/queries";
import { toAppError } from "@/lib/errors";
import { useSessionDialogsStore } from "@/state/sessionDialogs";

import { findSession } from "./sessionList";

/** The most characters a session's name can have. Rust keeps to the same number. */
const NAME_LENGTH = 100;

/** How many characters a name has, counted as Rust counts them: an emoji is one, not two. */
function lengthOf(name: string): number {
  return Array.from(name).length;
}

function RenameContent({
  sessionId,
  name: current,
  onDone,
}: {
  sessionId: string;
  name: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const field = useRef<HTMLInputElement>(null);
  const id = useId();
  // What had the focus before the dialog opened gets it back, wherever the dialog was opened from:
  // the dialog has no trigger of its own to give it to.
  const [returnFocusTo] = useState(() => document.activeElement);
  const [name, setName] = useState(current);
  const [error, setError] = useState<AppError | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  const tooLong = lengthOf(trimmed) > NAME_LENGTH;
  const canSave = trimmed !== "" && !tooLong && !saving;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await commands.renameSession(sessionId, trimmed);
      // The session's own copy changes in place: reading it again could repeat a reply that is
      // still streaming (ADR 0016).
      queryClient.setQueryData(
        sessionQuery(sessionId).queryKey,
        (session) => session && { ...session, title: trimmed },
      );
      await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
      onDone();
    } catch (failure) {
      setError(toAppError(failure));
      setSaving(false);
    }
  };

  return (
    <DialogContent
      showCloseButton={false}
      // The name starts selected, so typing replaces it, as renaming does in File Explorer.
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        field.current?.focus();
        field.current?.select();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) {
          returnFocusTo.focus();
        }
      }}
    >
      <form className="grid gap-4" onSubmit={(event) => void save(event)}>
        <DialogHeader>
          <DialogTitle>{t("sessions.rename.title")}</DialogTitle>
          <DialogDescription>{t("sessions.rename.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-name`}>{t("sessions.rename.label")}</Label>
          <Input
            ref={field}
            id={`${id}-name`}
            value={name}
            autoComplete="off"
            aria-invalid={error || tooLong ? true : undefined}
            aria-describedby={error || tooLong ? `${id}-error` : undefined}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          {error ? (
            <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
              {t("sessions.rename.failed", {
                what: t(`errors.${error.code}.what`),
                code: error.code,
              })}
            </p>
          ) : null}
          {tooLong && !error ? (
            <p id={`${id}-error`} className="text-xs text-destructive">
              {t("sessions.rename.tooLong", { limit: NAME_LENGTH })}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!canSave}>
            {t("sessions.rename.save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/**
 * Gives a session a name (ADR 0036): a small dialog, the same whether it was opened from the
 * sidebar, the session's header, the command palette or F2. Enter saves and Esc cancels. When it
 * closes, the focus goes back to where it was.
 */
export function RenameSessionDialog() {
  const sessionId = useSessionDialogsStore((state) => state.renaming);
  const close = useSessionDialogsStore((state) => state.close);
  const { data: list = noSessions } = useQuery(sessionListQuery);
  const session = sessionId === undefined ? undefined : findSession(list, sessionId);

  return (
    <Dialog
      open={session !== undefined}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {session ? (
        <RenameContent
          key={session.id}
          sessionId={session.id}
          name={session.title ?? ""}
          onDone={close}
        />
      ) : null}
    </Dialog>
  );
}
