import { create } from "zustand";

interface LayoutState {
  /** The sidebar with projects and sessions. Open by default. */
  sidebarOpen: boolean;
  /** The inspector on the right. Hidden by default. */
  inspectorOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleInspector: () => void;
}

/** Which regions of the window are shown. Their sizes belong to the resizable panels. */
export const useLayoutStore = create<LayoutState>()((set) => ({
  sidebarOpen: true,
  inspectorOpen: false,
  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
  },
  setInspectorOpen: (open) => {
    set({ inspectorOpen: open });
  },
  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },
  toggleInspector: () => {
    set((state) => ({ inspectorOpen: !state.inspectorOpen }));
  },
}));
