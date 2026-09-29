import { Outlet } from "@tanstack/react-router";

import { useNavigationHistory } from "@/lib/useNavigationHistory";

import { TitleBar } from "./TitleBar";

/** The frame around every page: the title bar, and the page below it. */
export function RootLayout() {
  const navigation = useNavigationHistory();

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* The command palette arrives with the commands ticket; until then the field does nothing. */}
      <TitleBar {...navigation} onSearch={() => {}} />
      <div className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
