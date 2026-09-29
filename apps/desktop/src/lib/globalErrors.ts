import type { AppError } from "@/ipc/bindings";

import { toAppError } from "./errors";
import { logger } from "./logger";

type Notify = (error: AppError) => void;

/** Logs an error nobody handled, and passes it on so the user can be told. */
function report(what: string, thrown: unknown, notify: Notify) {
  const error = toAppError(thrown);
  logger.error("ui", `${what}: ${error.details ?? error.messageKey}`, error.code);
  notify(error);
}

/** Runs for an error thrown anywhere in the UI that nothing caught. */
export function handleUncaughtError(event: ErrorEvent, notify: Notify) {
  report("Uncaught error", event.error ?? event.message, notify);
}

/** Runs for a promise that was rejected without anything handling the rejection. */
export function handleUnhandledRejection(event: PromiseRejectionEvent, notify: Notify) {
  report("Unhandled rejection", event.reason, notify);
}

/** Starts listening for uncaught errors and unhandled rejections. Returns a function that stops. */
export function installGlobalErrorHandlers(notify: Notify): () => void {
  const onError = (event: ErrorEvent) => {
    handleUncaughtError(event, notify);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    handleUnhandledRejection(event, notify);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
