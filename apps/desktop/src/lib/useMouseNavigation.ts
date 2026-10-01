import { useEffect } from "react";

interface Navigation {
  onBack: () => void;
  onForward: () => void;
}

/**
 * The mouse's side buttons go back and forward. (Alt+Left and Alt+Right are commands in the
 * registry.) The browser engine would navigate on its own, so these handlers stop it, and history
 * moves once.
 */
export function useMouseNavigation({ onBack, onForward }: Navigation) {
  useEffect(() => {
    // Button 3 is "back" and button 4 is "forward" on a mouse with side buttons.
    const onMouseButton = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      if (event.type === "mouseup") {
        if (event.button === 3) onBack();
        else onForward();
      }
    };

    window.addEventListener("mousedown", onMouseButton);
    window.addEventListener("mouseup", onMouseButton);
    return () => {
      window.removeEventListener("mousedown", onMouseButton);
      window.removeEventListener("mouseup", onMouseButton);
    };
  }, [onBack, onForward]);
}
