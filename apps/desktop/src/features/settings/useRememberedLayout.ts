import { useEffect, useRef, useState } from "react";

import type { SettingChange } from "@/ipc/bindings";

import { useChangeSetting, useSettings } from "./useSettings";

/** How long a panel must stay the same width before that width is saved. */
const SAVE_AFTER = 400;

/**
 * The widths the side panels had when the app started, and a way to remember new ones. A drag
 * reports every step, so a width is saved only once it has stopped changing (or the window closes).
 */
export function useRememberedLayout() {
  const { layout } = useSettings();
  const { mutate } = useChangeSetting();
  const [startingWidths] = useState(layout);
  const saved = useRef(layout);
  useEffect(() => {
    saved.current = layout;
  });
  const waiting = useRef(new Map<string, { timer: number; change: SettingChange }>());

  useEffect(() => {
    const pending = waiting.current;
    const saveNow = () => {
      for (const { timer, change } of pending.values()) {
        window.clearTimeout(timer);
        mutate(change);
      }
      pending.clear();
    };
    window.addEventListener("pagehide", saveNow);
    return () => {
      window.removeEventListener("pagehide", saveNow);
      saveNow();
    };
  }, [mutate]);

  const remember = (name: "sidebar" | "inspector", pixels: number) => {
    // A collapsed panel has no width to remember; it reopens at the last one.
    if (pixels <= 0) return;
    const width = Math.round(pixels);
    const current = name === "sidebar" ? saved.current.sidebarWidth : saved.current.inspectorWidth;
    const pending = waiting.current;
    window.clearTimeout(pending.get(name)?.timer);
    if (width === current) {
      pending.delete(name);
      return;
    }
    const change: SettingChange =
      name === "sidebar" ? { layoutSidebarWidth: width } : { layoutInspectorWidth: width };
    const timer = window.setTimeout(() => {
      pending.delete(name);
      mutate(change);
    }, SAVE_AFTER);
    pending.set(name, { timer, change });
  };

  return { startingWidths, remember };
}
