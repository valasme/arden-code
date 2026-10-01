import { useMutation, useQueryClient } from "@tanstack/react-query";

import { commands } from "@/ipc/bindings";
import { settingsQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

/** Saves the shortcuts of one command. Rust checks them again and answers with what it kept. */
export function useSetShortcuts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ command, shortcuts }: { command: string; shortcuts: readonly string[] }) =>
      commands.setShortcuts(command, [...shortcuts]),
    onSuccess: (saved) => {
      queryClient.setQueryData(settingsQuery.queryKey, saved);
    },
    onError: (error) => {
      showErrorToast(toAppError(error));
    },
  });
}

/** Gives one command, or with `undefined` every command, its default shortcuts again. */
export function useResetShortcuts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (command: string | undefined) => commands.resetShortcuts(command ?? null),
    onSuccess: (saved) => {
      queryClient.setQueryData(settingsQuery.queryKey, saved);
    },
    onError: (error) => {
      showErrorToast(toAppError(error));
    },
  });
}
