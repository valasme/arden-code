import { isTauri } from "@tauri-apps/api/core";

import { commands, type AppError } from "@/ipc/bindings";

import { errorReport } from "./errors";

interface CopyContext {
  /** What happened, in words. */
  what: string;
  version?: string | undefined;
}

/**
 * Puts a description of an error on the clipboard. The text may be shared, so Rust removes the
 * user's folder, email addresses and secrets from it first.
 */
export async function copyErrorDetails(error: AppError, context: CopyContext): Promise<void> {
  const report = errorReport(error, {
    ...context,
    // The path only: an address can carry data that should not be shared.
    page: window.location.pathname,
    time: new Date(),
  });
  const safe = isTauri() ? await commands.redactText(report) : report;
  await navigator.clipboard.writeText(safe);
}
