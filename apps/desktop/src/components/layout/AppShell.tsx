import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { usePanelRef } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useNavigationHistory } from "@/lib/useNavigationHistory";
import { RenameSessionDialog } from "@/features/sessions/RenameSessionDialog";
import { SessionsSync } from "@/features/sessions/SessionsSync";
import { CheatSheet } from "@/features/commands/CheatSheet";
import { ContextMenuHost } from "@/features/contextMenu/ContextMenuHost";
import { CommandPalette } from "@/features/commands/CommandPalette";
import { CommandsProvider } from "@/features/commands/CommandsProvider";
import { useMouseNavigation } from "@/lib/useMouseNavigation";
import { useRememberedLayout } from "@/features/settings/useRememberedLayout";
import { useSettings } from "@/features/settings/useSettings";
import { useOverlayStore } from "@/state/overlays";
import { useLayoutStore } from "@/state/layout";
import { isSettingsPage, useSettingsPageStore } from "@/state/settingsPage";

import { TitleBar } from "../TitleBar";
import { Inspector } from "./Inspector";
import { LayoutControls } from "./LayoutControls";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";

/**
 * Makes a panel follow the store: it collapses or expands when `open` changes, and a drag that
 * collapses or reopens it reports back through the panel's `onResize`.
 */
function usePanelOpen(open: boolean, remembered: number) {
  const panel = usePanelRef();
  // Read when the panel opens, so a new width does not re-run the effect below.
  const width = useRef(remembered);
  useEffect(() => {
    width.current = remembered;
  });

  useEffect(() => {
    const handle = panel.current;
    if (!handle) return;
    // Panels only accept commands once they are laid out.
    try {
      if (open && handle.isCollapsed()) {
        handle.expand();
        // A panel that started closed has no size of its own yet: open it at the remembered width.
        handle.resize(`${width.current}px`);
      }
      if (!open && !handle.isCollapsed()) handle.collapse();
    } catch {
      // Not laid out yet. The panel starts at its default size from when the window opened, and its
      // first size report brings the store in line with it.
    }
  }, [open, panel]);

  return panel;
}

/** Remembers the last page outside Settings, where Back in the settings sidebar returns to. */
function useReturnFromSettings() {
  const location = useRouterState({ select: (state) => state.location });
  const setReturnTo = useSettingsPageStore((state) => state.setReturnTo);
  useEffect(() => {
    if (!isSettingsPage(location.pathname)) setReturnTo(location.href);
  }, [location, setReturnTo]);
}

/** The frame around every page: title bar, sidebar, page, inspector and status bar. */
export function AppShell() {
  useReturnFromSettings();
  const navigation = useNavigationHistory();
  useMouseNavigation(navigation);
  const openPalette = useOverlayStore((state) => state.setPaletteOpen);

  const sidebarOpen = useLayoutStore((state) => state.sidebarOpen);
  const inspectorOpen = useLayoutStore((state) => state.inspectorOpen);
  const setSidebarOpen = useLayoutStore((state) => state.setSidebarOpen);
  const setInspectorOpen = useLayoutStore((state) => state.setInspectorOpen);
  const { startingWidths, remember } = useRememberedLayout();
  const { appearance, layout, advanced } = useSettings();
  const sidebarPanel = usePanelOpen(sidebarOpen, layout.sidebarWidth);
  const inspectorPanel = usePanelOpen(inspectorOpen, layout.inspectorWidth);
  // The panels' sizes when the window opens, kept from then on. A panel whose default size changes
  // registers with its group again, and the group's first report of its size, from before the
  // change, would undo the toggle that changed it.
  const [defaultSizes] = useState(() => ({
    sidebar: sidebarOpen ? `${startingWidths.sidebarWidth}px` : "0px",
    inspector: inspectorOpen ? `${startingWidths.inspectorWidth}px` : "0px",
  }));
  const { showStatusBar } = appearance;

  return (
    <CommandsProvider>
      {/* The window, whatever the page around it: the regions inside scroll, never the page. */}
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <TitleBar
          {...navigation}
          native={advanced.nativeTitleBar}
          controls={<LayoutControls />}
          onSearch={() => {
            openPalette(true);
          }}
        />
        <div className="min-h-0 flex-1">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel
              id="sidebar"
              panelRef={sidebarPanel}
              defaultSize={defaultSizes.sidebar}
              minSize="180px"
              maxSize="480px"
              collapsible
              collapsedSize="0px"
              groupResizeBehavior="preserve-pixel-size"
              onResize={(size) => {
                setSidebarOpen(size.inPixels > 0);
                remember("sidebar", size.inPixels);
              }}
            >
              <Sidebar hidden={!sidebarOpen} />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="session-view" minSize="320px">
              <div data-area="session" tabIndex={-1} className="h-full overflow-auto">
                <Outlet />
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              id="inspector"
              panelRef={inspectorPanel}
              defaultSize={defaultSizes.inspector}
              minSize="240px"
              maxSize="640px"
              collapsible
              collapsedSize="0px"
              groupResizeBehavior="preserve-pixel-size"
              onResize={(size) => {
                setInspectorOpen(size.inPixels > 0);
                remember("inspector", size.inPixels);
              }}
            >
              <Inspector hidden={!inspectorOpen} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        {showStatusBar ? <StatusBar /> : null}
        <CommandPalette />
        <CheatSheet />
        <RenameSessionDialog />
        <ContextMenuHost />
        <SessionsSync />
      </div>
    </CommandsProvider>
  );
}
