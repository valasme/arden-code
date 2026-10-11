import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";

import { commands, type FileMatch } from "@/ipc/bindings";

/**
 * The files of a project that match what was typed after `@` (ADR 0052), as Rust matches them,
 * asked for again as the query changes; the answer to the latest query wins. Until the first
 * answer arrives, and while there is no query, nothing.
 */
export function useFileMatches(
  projectId: string | undefined,
  query: string | null,
): FileMatch[] | undefined {
  const { data } = useQuery({
    queryKey: ["project-files", projectId, query],
    queryFn: () => commands.findFiles(projectId ?? "", query ?? ""),
    enabled: isTauri() && projectId !== undefined && query !== null,
    // Rust keeps the folder's listing and lists it again when it is old, so every opening asks.
    staleTime: 0,
    gcTime: 0,
    // While the next answer is on its way, the list keeps the last one instead of going blank.
    placeholderData: keepPreviousData,
  });
  return query === null ? undefined : data;
}
