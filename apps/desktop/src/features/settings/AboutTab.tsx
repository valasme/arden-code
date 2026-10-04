import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { writeClipboard } from "@/features/contextMenu/clipboard";
import { commands, type ProjectPage } from "@/ipc/bindings";
import { appInfoQuery, systemInfoQuery } from "@/ipc/queries";
import { showErrorToast } from "@/lib/errorToasts";
import { toAppError } from "@/lib/errors";

import licenseText from "../../../../../LICENSE?raw";
import licenses from "./licenses.gen.json";
import { matchesSearch } from "@/lib/search";

/** How many packages the license list shows at once. Typing narrows it. */
const licensesShown = 100;

function openPage(page: ProjectPage) {
  commands.openProjectPage(page).catch((error: unknown) => {
    showErrorToast(toAppError(error));
  });
}

/**
 * One line of the "about this build" list: what it is, and its value, which goes under it when the
 * column is too narrow for both.
 */
function Fact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex flex-wrap gap-x-2 py-1 text-sm">
      <dt className="w-28 max-w-full shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words tabular-nums">{value ?? "…"}</dd>
    </div>
  );
}

function OpenSourceLicenses() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const matching = licenses.filter((item) =>
    matchesSearch({ label: item.name, description: `${item.license} ${item.version}` }, query),
  );
  const shown = matching.slice(0, licensesShown);

  return (
    <details className="border-b border-border py-4">
      <summary className="text-sm font-medium">
        {t("settings.about.openSource.title", { count: licenses.length })}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("settings.about.openSource.description")}
      </p>
      <Input
        type="search"
        className="my-2"
        aria-label={t("settings.about.openSource.search")}
        placeholder={t("settings.about.openSource.search")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="py-1 font-medium">
              {t("settings.about.openSource.package")}
            </th>
            <th scope="col" className="py-1 font-medium">
              {t("settings.about.openSource.license")}
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((item) => (
            <tr
              key={`${item.kind}-${item.name}-${item.version}`}
              className="border-t border-border"
            >
              <td className="py-1 pr-2 break-all">
                {item.name} <span className="text-muted-foreground">{item.version}</span>
              </td>
              <td className="py-1">{item.license}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {matching.length > shown.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("settings.about.openSource.more", { shown: shown.length, total: matching.length })}
        </p>
      ) : null}
      {matching.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("settings.about.openSource.none")}</p>
      ) : null}
    </details>
  );
}

/** About: what is running, where it came from, and what it is built with. */
export function AboutTab() {
  const { t } = useTranslation();
  const { data: app } = useQuery(appInfoQuery);
  const { data: system } = useQuery(systemInfoQuery);

  const copySystemInfo = () => {
    if (!app || !system) return;
    const text = t("settings.about.systemInfoTemplate", {
      name: app.name,
      version: app.version,
      commit: app.commit,
      date: app.buildDate,
      windows: system.windows,
      webview: system.webview,
    });
    writeClipboard(text)
      .then(() => {
        toast.success(t("settings.about.copied"));
      })
      .catch((error: unknown) => {
        showErrorToast(toAppError(error));
      });
  };

  const [checking, setChecking] = useState(false);
  const checkForUpdates = () => {
    setChecking(true);
    commands
      .checkForUpdates()
      .then((result) => {
        const message = t(`settings.about.checkForUpdates.${result}`);
        if (result === "ready" || result === "upToDate") toast.success(message);
        else toast.info(message);
      })
      .catch((error: unknown) => {
        showErrorToast(toAppError(error));
      })
      .finally(() => {
        setChecking(false);
      });
  };

  return (
    <div>
      <div className="flex items-center gap-4 py-4">
        <Logo className="h-10 w-auto" />
      </div>

      <dl className="border-b border-border pb-4">
        <Fact label={t("settings.about.version")} value={app?.version} />
        <Fact
          label={t("settings.about.build")}
          value={
            app
              ? t("settings.about.buildValue", { commit: app.commit, date: app.buildDate })
              : undefined
          }
        />
        <Fact label={t("settings.about.windows")} value={system?.windows} />
        <Fact label={t("settings.about.webview")} value={system?.webview} />
      </dl>

      <div className="flex flex-wrap gap-2 border-b border-border py-4">
        <Button variant="outline" disabled={!app || !system} onClick={copySystemInfo}>
          {t("settings.about.copy")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            commands.openBugReport().catch((error: unknown) => {
              showErrorToast(toAppError(error));
            });
          }}
        >
          {t("settings.about.reportBug")}
        </Button>
        <Button variant="outline" disabled={checking} onClick={checkForUpdates}>
          {checking
            ? t("settings.about.checkForUpdates.checking")
            : t("settings.about.checkForUpdates.button")}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            openPage("releases");
          }}
        >
          {t("settings.about.releaseNotes")}
        </Button>
      </div>

      <section aria-labelledby="privacy-heading" className="border-b border-border py-4">
        <h2 id="privacy-heading" className="text-sm font-medium">
          {t("settings.about.privacy.title")}
        </h2>
        <p className="mt-1 text-sm">{t("settings.about.privacy.statement")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("settings.about.privacy.detail")}</p>
        <Button
          variant="link"
          className="h-auto px-0 text-start whitespace-normal"
          onClick={() => {
            openPage("privacy");
          }}
        >
          {t("settings.about.privacy.read")}
        </Button>
      </section>

      <section aria-labelledby="license-heading" className="border-b border-border py-4">
        <h2 id="license-heading" className="text-sm font-medium">
          {t("settings.about.license")}
        </h2>
        <pre className="mt-2 text-xs whitespace-pre-wrap">{licenseText.trim()}</pre>
      </section>

      <p className="border-b border-border py-4 text-sm">{t("settings.about.notAffiliated")}</p>

      <OpenSourceLicenses />
    </div>
  );
}
