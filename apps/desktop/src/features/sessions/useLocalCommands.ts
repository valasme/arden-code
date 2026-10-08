import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { Catalog, Effort, Model } from "@/ipc/bindings";

import { parseLocalCommand, resolveEffort, resolveModel } from "./slashCommands";

/** What the four slash commands that Arden Code runs itself act on (ADR 0042). */
export interface LocalActions {
  catalog: Catalog;
  chooseModel: (model: Model | null) => void;
  chooseEffort: (effort: Effort | null) => void;
  /** Renames the session; with no name, asks for one. None where there is no session yet. */
  rename?: (name: string) => void;
  /** Starts a new session, as New session does. */
  clear: () => void;
}

/**
 * Runs a message that is one of the four slash commands that change what Arden Code also holds,
 * instead of sending it to Claude Code (ADR 0042): `/model`, `/effort`, `/rename` and `/clear`.
 * Answers whether the message was one of them. What cannot be done, such as a model that Claude Code
 * does not list, is said in a notice.
 */
export function useLocalCommands() {
  const { t } = useTranslation();

  return (text: string, actions: LocalActions): boolean => {
    const command = parseLocalCommand(text);
    if (!command) return false;
    switch (command.kind) {
      case "model": {
        const model = resolveModel(actions.catalog, command.argument);
        if (model) actions.chooseModel(model.model);
        else if (command.argument === "") toast.info(t("sessions.slash.modelUsage"));
        else toast.error(t("sessions.slash.noModel", { name: command.argument }));
        return true;
      }
      case "effort": {
        const effort = resolveEffort(command.argument);
        if (effort) actions.chooseEffort(effort.effort);
        else toast.info(t("sessions.slash.effortUsage"));
        return true;
      }
      case "rename": {
        if (actions.rename) actions.rename(command.argument);
        else toast.info(t("sessions.slash.renameLater"));
        return true;
      }
      case "clear": {
        actions.clear();
        return true;
      }
      default: {
        return false;
      }
    }
  };
}
