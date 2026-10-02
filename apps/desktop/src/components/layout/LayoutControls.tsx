import {
  type LucideIcon,
  PanelBottomDashedIcon,
  PanelBottomIcon,
  PanelLeftDashedIcon,
  PanelLeftIcon,
  PanelRightDashedIcon,
  PanelRightIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { CommandTooltip } from "@/features/commands/CommandTooltip";
import { useCommands } from "@/features/commands/CommandsProvider";
import type { CommandId } from "@/features/commands/registry";
import { useSettings } from "@/features/settings/useSettings";
import { useLayoutStore } from "@/state/layout";

import { BarButton } from "../TitleBar";

interface LayoutToggleProps {
  command: CommandId;
  /** The region's name. It stays the same; the pressed state says whether the region is shown. */
  label: string;
  shown: boolean;
  /** The icon while the region is shown, filled, and while it is hidden, dashed. */
  icons: readonly [LucideIcon, LucideIcon];
}

function LayoutToggle({
  command,
  label,
  shown,
  icons: [ShownIcon, HiddenIcon],
}: LayoutToggleProps) {
  const { run } = useCommands();
  const Icon = shown ? ShownIcon : HiddenIcon;

  return (
    <CommandTooltip command={command}>
      <BarButton
        aria-label={label}
        aria-pressed={shown}
        className="w-8"
        onClick={() => run(command)}
      >
        <Icon aria-hidden className="size-5" strokeWidth={1.5} />
      </BarButton>
    </CommandTooltip>
  );
}

/**
 * Toggles for the regions of the window, as in VS Code (ADR 0033). Each says whether its region is
 * shown, and runs the same command as its shortcut.
 */
export function LayoutControls() {
  const { t } = useTranslation();
  const sidebarOpen = useLayoutStore((state) => state.sidebarOpen);
  const inspectorOpen = useLayoutStore((state) => state.inspectorOpen);
  const { showStatusBar } = useSettings().appearance;

  return (
    <div className="flex">
      <LayoutToggle
        command="sidebar.toggle"
        label={t("titleBar.sidebar")}
        shown={sidebarOpen}
        icons={[PanelLeftIcon, PanelLeftDashedIcon]}
      />
      <LayoutToggle
        command="inspector.toggle"
        label={t("titleBar.inspector")}
        shown={inspectorOpen}
        icons={[PanelRightIcon, PanelRightDashedIcon]}
      />
      <LayoutToggle
        command="statusBar.toggle"
        label={t("titleBar.statusBar")}
        shown={showStatusBar}
        icons={[PanelBottomIcon, PanelBottomDashedIcon]}
      />
    </div>
  );
}
