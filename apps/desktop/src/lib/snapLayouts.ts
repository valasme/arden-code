import { isTauri } from "@tauri-apps/api/core";
import { type RefObject, useEffect, useState } from "react";

import { commands, events, type MaximizeButtonArea, type MaximizeButtonLook } from "@/ipc/bindings";

/** Where an element is in the screen's pixels, Windows' own unit, from the top left of the page. */
function screenArea(element: Element): MaximizeButtonArea {
  const rect = element.getBoundingClientRect();
  // The page's pixels times the display scaling of Windows.
  const scale = window.devicePixelRatio;
  const left = Math.round(rect.left * scale);
  const top = Math.round(rect.top * scale);
  return {
    x: left,
    y: top,
    width: Math.round(rect.right * scale) - left,
    height: Math.round(rect.bottom * scale) - top,
  };
}

function sameArea(a: MaximizeButtonArea, b: MaximizeButtonArea): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/**
 * Calls `onChange` when the display scaling changes, such as on a monitor with another scaling.
 * The page does not resize then, but its pixels are a different number of the screen's.
 */
function watchScaling(onChange: () => void): () => void {
  let query: MediaQueryList | undefined;
  const changed = () => {
    onChange();
    listen();
  };
  const listen = () => {
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener("change", changed, { once: true });
  };
  listen();
  return () => query?.removeEventListener("change", changed);
}

/**
 * Snap Layouts on the title bar's Maximize button (ADR 0009). Tells Rust where the button is, so
 * the overlay that makes Windows offer its layouts sits exactly over it, and returns how the button
 * should look: the overlay takes the pointer, so Rust says when it is on the button or presses it.
 * Without a button, as with the title bar of Windows, Rust is told there is none to cover.
 */
export function useSnapLayouts(
  button: RefObject<HTMLElement | null>,
  enabled: boolean,
): MaximizeButtonLook {
  const [look, setLook] = useState<MaximizeButtonLook>("normal");

  useEffect(() => {
    if (!isTauri()) return undefined;
    const element = button.current;
    if (!enabled || !element) {
      commands.setMaximizeButton(null).catch(() => {});
      return undefined;
    }

    let sent: MaximizeButtonArea | undefined;
    let frame = 0;
    // Once per frame at most, and only when the area changed.
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const area = screenArea(element);
        if (sent && sameArea(sent, area)) return;
        sent = area;
        commands.setMaximizeButton(area).catch(() => {});
      });
    };
    report();
    // The button moves as the window is resized and grows with the zoom.
    const sizes = new ResizeObserver(report);
    sizes.observe(element);
    window.addEventListener("resize", report);
    const stopWatchingScaling = watchScaling(report);

    return () => {
      cancelAnimationFrame(frame);
      sizes.disconnect();
      window.removeEventListener("resize", report);
      stopWatchingScaling();
      commands.setMaximizeButton(null).catch(() => {});
    };
  }, [button, enabled]);

  useEffect(() => {
    if (!isTauri() || !enabled) return undefined;
    let active = true;
    let stopListening: (() => void) | undefined;

    events.maximizeButtonChanged
      .listen(({ payload }) => {
        setLook(payload.look);
      })
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

  return enabled ? look : "normal";
}
