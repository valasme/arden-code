import { useEffect } from "react";

interface Navigation {
  onBack: () => void;
  onForward: () => void;
}

/**
 * Alt+Left and Alt+Right, and the mouse's side buttons, go back and forward.
 *
 * The browser engine would do the same on its own, so these handlers stop it, and history moves once.
 * The commands ticket replaces this with entries in the command registry.
 */
export function useNavigationShortcuts({ onBack, onForward }: Navigation) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onBack();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onForward();
      }
    };

    // Button 3 is "back" and button 4 is "forward" on a mouse with side buttons.
    const onMouseButton = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      if (event.type === "mouseup") {
        if (event.button === 3) onBack();
        else onForward();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseButton);
    window.addEventListener("mouseup", onMouseButton);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onMouseButton);
      window.removeEventListener("mouseup", onMouseButton);
    };
  }, [onBack, onForward]);
}
