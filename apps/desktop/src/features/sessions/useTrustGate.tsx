import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { type AgentKind, commands, type Project } from "@/ipc/bindings";
import { sessionListQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

import { TrustDialog } from "./TrustDialog";

/** A message that waits for the person to trust its folder, and how to say what became of it. */
interface Waiting {
  project: Project;
  go: () => boolean | Promise<boolean>;
  sent: (sent: boolean) => void;
}

/**
 * Claude first works in a folder only once the person trusts it (ADR 0039). `gate` sends at once,
 * or first asks with the trust dialog, which `dialog` draws: Trust saves the trust and sends,
 * Cancel answers `false` so the message stays in the box.
 */
export function useTrustGate(): {
  gate: (
    agent: AgentKind,
    project: Project | undefined,
    go: () => boolean | Promise<boolean>,
  ) => boolean | Promise<boolean>;
  dialog: ReactNode;
} {
  const queryClient = useQueryClient();
  const [waiting, setWaiting] = useState<Waiting | null>(null);

  const gate = (
    agent: AgentKind,
    project: Project | undefined,
    go: () => boolean | Promise<boolean>,
  ) => {
    if (agent !== "claude" || project?.kind !== "folder" || project.trusted) return go();
    return new Promise<boolean>((sent) => {
      setWaiting({ project, go, sent });
    });
  };

  const dialog = waiting ? (
    <TrustDialog
      name={waiting.project.name}
      path={waiting.project.path}
      onAnswer={(trusted) => {
        setWaiting(null);
        if (!trusted) {
          waiting.sent(false);
          return;
        }
        commands
          .trustProject(waiting.project.id)
          .then(async () => {
            await queryClient.invalidateQueries({ queryKey: sessionListQuery.queryKey });
            waiting.sent(await waiting.go());
          })
          .catch((failure: unknown) => {
            showErrorToast(toAppError(failure));
            waiting.sent(false);
          });
      }}
    />
  ) : null;

  return { gate, dialog };
}
