import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useEffectEvent } from "react";

/**
 * Keeps a Tauri listener while the component is on screen, such as one for an event Rust sends:
 * `listen` starts it and resolves to the function that stops it. It starts once, and always runs
 * the newest `listen`, so what it does may use the component's current values. A listener that
 * only finishes starting after the component has gone is stopped at once. Outside Tauri, such as
 * in a browser during development, nothing listens.
 */
export function useTauriListener(listen: () => Promise<() => void>, enabled = true): void {
  const start = useEffectEvent(listen);

  useEffect(() => {
    if (!isTauri() || !enabled) return undefined;
    let active = true;
    let stopListening: (() => void) | undefined;

    start()
      .then((unlisten) => {
        if (active) stopListening = unlisten;
        else unlisten();
      })
      .catch(() => {});

    return () => {
      active = false;
      stopListening?.();
    };
  }, [enabled]);
}
