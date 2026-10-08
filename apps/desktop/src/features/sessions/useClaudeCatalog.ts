import { useQuery } from "@tanstack/react-query";

import type { Catalog } from "@/ipc/bindings";
import { claudeCatalogQuery } from "@/ipc/queries";

import { emptyCatalog } from "./claudeCatalog";

/**
 * Claude Code's slash commands and models (ADR 0042), once it has said them. Asked for only while
 * the session is a Claude session: that is what starts the one that listens.
 */
export function useClaudeCatalog(enabled: boolean): Catalog {
  const { data } = useQuery({ ...claudeCatalogQuery, enabled });
  return data ?? emptyCatalog;
}
