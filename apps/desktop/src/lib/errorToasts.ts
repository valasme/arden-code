import { t } from "i18next";
import { toast } from "sonner";

import type { AppError } from "@/ipc/bindings";

import { copyErrorDetails } from "./copyDetails";
import { reportError } from "./globalErrors";

/** The text for a code, or the generic text when this version of the UI has none for it. */
function what(error: AppError): string {
  const key = `errors.${error.code}.what` as const;
  return t(key, { defaultValue: t("errors.ARD-APP-001.what") });
}

function copyAction(error: AppError, description: string) {
  return {
    label: t("errorScreen.copyDetails"),
    onClick: () => {
      copyErrorDetails(error, { what: description }).catch(() => {});
    },
  };
}

/** Tells the user about an error nobody handled, with its code and a way to copy the details. */
export function showErrorToast(error: AppError) {
  const description = what(error);
  toast.error(t("notices.uiError", { code: error.code }), {
    description,
    duration: 12_000,
    action: copyAction(error, description),
  });
}

/**
 * Tells the user about something the app dealt with by itself, such as a settings file that had to
 * be replaced by the defaults. Quieter than an error, and it still carries the code.
 */
export function showNoticeToast(error: AppError) {
  const description = what(error);
  toast.warning(t("notices.title", { code: error.code }), {
    description,
    duration: 12_000,
    action: copyAction(error, description),
  });
}

/**
 * For something the person asked for that failed, and that nothing else will mention: logs it and tells
 * them, with its code, as for an error nobody handled.
 */
export function reportFailure(action: string, thrown: unknown) {
  reportError(action, thrown, showErrorToast);
}
