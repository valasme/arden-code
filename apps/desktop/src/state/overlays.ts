import { create } from "zustand";

interface OverlayState {
  paletteOpen: boolean;
  cheatSheetOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setCheatSheetOpen: (open: boolean) => void;
}

/** Which dialogs are open: the command palette and the shortcut cheat sheet. */
export const useOverlayStore = create<OverlayState>()((set) => ({
  paletteOpen: false,
  cheatSheetOpen: false,
  setPaletteOpen: (open) => {
    set({ paletteOpen: open });
  },
  setCheatSheetOpen: (open) => {
    set({ cheatSheetOpen: open });
  },
}));
