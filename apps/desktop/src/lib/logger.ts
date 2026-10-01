import { isTauri } from "@tauri-apps/api/core";

import { commands, type UiLogLevel } from "@/ipc/bindings";

function log(level: UiLogLevel, source: string, message: string, code?: string) {
  if (!isTauri()) {
    // In a plain browser, such as during development, there is no Rust log to write to.
    console[level === "debug" ? "log" : level](`[${source}]`, message, code ?? "");
    return;
  }
  // A failure to log must never become an error of its own.
  commands.logFromUi(level, source, message, code ?? null).catch(() => {});
}

/**
 * Writes to the same log files as Rust. `source` says which part of the UI is speaking, and `code`
 * is the error code when the message is about an error.
 */
export const logger = {
  error: (source: string, message: string, code?: string) => {
    log("error", source, message, code);
  },
  warn: (source: string, message: string, code?: string) => {
    log("warn", source, message, code);
  },
  info: (source: string, message: string, code?: string) => {
    log("info", source, message, code);
  },
  debug: (source: string, message: string, code?: string) => {
    log("debug", source, message, code);
  },
};
