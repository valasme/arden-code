import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { commands, type Marketplace, type MarketplaceAction } from "@/ipc/bindings";
import { installedPluginsQuery, marketplacesQuery } from "@/ipc/queries";
import { toAppError } from "@/lib/errors";

import { afterChange } from "./afterChange";
import { PluginsProblem } from "./PluginsProblem";

/** What a change to plugins or marketplaces came to: under way, Claude Code's words, or why not. */
function ChangeOutcome({
  pending,
  pendingText,
  message,
  waiting,
  error,
}: {
  pending: boolean;
  pendingText: string;
  message: string | undefined;
  waiting: boolean;
  error: unknown;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div aria-live="polite" className="text-xs empty:hidden">
        {pending ? pendingText : null}
        {message}
        {waiting ? <p className="text-muted-foreground">{t("plugins.waiting")}</p> : null}
      </div>
      {error ? <PluginsProblem error={toAppError(error)} /> : null}
    </>
  );
}

/**
 * One marketplace: its name, where it comes from, Update, and Remove after a confirmation that
 * counts the plugins it uninstalls with it (ADR 0053).
 */
function MarketplaceRow({ marketplace }: { marketplace: Marketplace }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const installed = useQuery(installedPluginsQuery).data ?? [];
  const fromIt = installed.filter((plugin) => plugin.marketplace === marketplace.name).length;
  const change = useMutation({
    mutationFn: (action: MarketplaceAction) => commands.changeMarketplace(action, marketplace.name),
    onSettled: () => afterChange(queryClient),
  });

  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-sm font-medium">{marketplace.name}</h2>
        <span className="ms-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={change.isPending}
            aria-label={t("plugins.marketplaces.updateLabel", { name: marketplace.name })}
            onClick={() => {
              change.mutate("update");
            }}
          >
            {t("plugins.marketplaces.update")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={change.isPending}
            aria-label={t("plugins.marketplaces.removeLabel", { name: marketplace.name })}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t("plugins.marketplaces.remove")}
          </Button>
        </span>
      </div>
      <p className="font-mono text-xs break-all text-muted-foreground">{marketplace.source}</p>
      <ChangeOutcome
        pending={change.isPending}
        pendingText={t("plugins.marketplaces.changing", { name: marketplace.name })}
        message={change.data?.message}
        waiting={change.data?.sessionsWaiting ?? false}
        error={change.error}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("plugins.marketplaces.removeTitle", { name: marketplace.name })}
        description={t("plugins.marketplaces.removeDescription", { count: fromIt })}
        confirmLabel={t("plugins.marketplaces.remove")}
        destructive
        onConfirm={() => {
          setConfirming(false);
          change.mutate("remove");
        }}
      />
    </li>
  );
}

/** Adds a marketplace from what the person types, and says what became of it. */
export function AddMarketplace() {
  const { t } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const [source, setSource] = useState("");
  const add = useMutation({
    mutationFn: (typed: string) => commands.addMarketplace(typed),
    onSettled: () => afterChange(queryClient),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (source.trim() === "") return;
    add.mutate(source.trim());
  };

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <label htmlFor={`${id}-source`} className="text-sm font-medium">
        {t("plugins.marketplaces.source")}
      </label>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {t("plugins.marketplaces.sourceHint")}
      </p>
      <div className="flex gap-2">
        <Input
          id={`${id}-source`}
          aria-describedby={`${id}-hint`}
          value={source}
          placeholder="owner/repo"
          onChange={(event) => {
            setSource(event.target.value);
          }}
        />
        <Button type="submit" disabled={add.isPending || source.trim() === ""}>
          {t("plugins.marketplaces.add")}
        </Button>
      </div>
      <ChangeOutcome
        pending={add.isPending}
        pendingText={t("plugins.marketplaces.adding")}
        message={add.data?.message}
        waiting={add.data?.sessionsWaiting ?? false}
        error={add.error}
      />
    </form>
  );
}

/**
 * The Marketplaces tab (ADR 0053): the person's marketplaces, each with Update and Remove, and a
 * way to add one from a GitHub \`owner/repo\`, a git address, a folder or a \`marketplace.json\`
 * address.
 */
export function MarketplacesTab() {
  const { t } = useTranslation();
  const known = useQuery(marketplacesQuery);

  return (
    <div className="flex flex-col gap-6">
      <AddMarketplace />
      {known.isError ? <PluginsProblem error={toAppError(known.error)} /> : null}
      {known.data === undefined ? null : known.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("plugins.marketplaces.none")}</p>
      ) : (
        <ul
          aria-label={t("plugins.marketplaces.label")}
          className="divide-y divide-border border border-border"
        >
          {known.data.map((marketplace) => (
            <MarketplaceRow
              key={`${marketplace.agent}:${marketplace.name}`}
              marketplace={marketplace}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
