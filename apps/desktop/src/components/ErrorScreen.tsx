import { useQuery } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { commands } from "@/ipc/bindings";
import { appInfoQuery } from "@/ipc/queries";
import { copyErrorDetails } from "@/lib/copyDetails";
import { toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** The text to use when this version of the UI has no words for a code. */
const fallbackCode = "ARD-APP-001";

const reloadWindow = () => {
  window.location.reload();
};

/** Opens the folder with the log files, and logs it if that fails. */
function openLogs() {
  if (!isTauri()) return;
  commands.openLogsFolder().catch((failure: unknown) => {
    const failed = toAppError(failure);
    logger.error("ui", `Could not open the logs folder: ${failed.details ?? ""}`, failed.code);
  });
}

interface ErrorScreenProps {
  /** Whatever was thrown. Errors from Rust keep their code; anything else becomes ARD-APP-002. */
  error: unknown;
  onReload?: () => void;
}

/** What a page shows when it fails: the error code, what to do, and ways to get help. */
export function ErrorScreen({ error, onReload = reloadWindow }: ErrorScreenProps) {
  const { t, i18n } = useTranslation();
  const appError = toAppError(error);
  const { data: info } = useQuery(appInfoQuery);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);

  // Say so in the log, once per error, so the code on the screen can be found there.
  useEffect(() => {
    logger.error(
      "ui",
      `Error screen shown: ${appError.details ?? appError.messageKey}`,
      appError.code,
    );
    // The error object is a new value on every render, so its code and details are its identity.
  }, [appError.code, appError.details, appError.messageKey]);

  // Keyboard and screen reader users land on the error, not on whatever was focused before.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  /** The words for this code, or the generic ones when the UI has none for it. */
  const words = (part: "what" | "why" | "action") =>
    i18n.exists(`errors.${appError.code}.${part}`)
      ? t(`errors.${appError.code}.${part}`)
      : t(`errors.${fallbackCode}.${part}`);

  const copyDetails = async () => {
    await copyErrorDetails(appError, { what: words("what"), version: info?.version });
    setCopied(true);
  };

  return (
    <main className="flex max-w-xl flex-col gap-4 p-6">
      <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none">
        {t("errorScreen.title")}
      </h1>
      <p className="text-sm">
        <span className="text-muted-foreground">{t("errorScreen.code")}: </span>
        <code className="text-sm">{appError.code}</code>
      </p>
      <div role="alert">
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              {t("errorScreen.whatHappened")}
            </dt>
            <dd>{words("what")}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{t("errorScreen.why")}</dt>
            <dd>{words("why")}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              {t("errorScreen.whatToDo")}
            </dt>
            <dd>{words("action")}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            copyDetails().catch(() => {});
          }}
        >
          {t("errorScreen.copyDetails")}
        </Button>
        <Button onClick={onReload}>{t("errorScreen.reload")}</Button>
        <Button variant="outline" onClick={openLogs}>
          {t("errorScreen.openLogs")}
        </Button>
        <output className="text-xs text-muted-foreground">
          {copied ? t("errorScreen.copied") : ""}
        </output>
      </div>
    </main>
  );
}
