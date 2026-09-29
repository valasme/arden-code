import { t } from "i18next";
import { toast } from "sonner";

import type { AppError } from "@/ipc/bindings";

import { copyErrorDetails } from "./copyDetails";

/** The text for a code, or the generic text when this version of the UI has none for it. */
function what(error: AppError): string {
  const key = `errors.${error.code}.what` as const;
  return t(key, { defaultValue: t("errors.ARD-APP-001.what") });
}

/** Tells the user about an error nobody handled, with its code and a way to copy the details. */
export function showErrorToast(error: AppError) {
  const description = what(error);
  toast.error(t("notices.uiError", { code: error.code }), {
    description,
    duration: 12_000,
    action: {
      label: t("errorScreen.copyDetails"),
      onClick: () => {
        copyErrorDetails(error, { what: description }).catch(() => {});
      },
    },
  });
}
