import { useRouter } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";

/** Back and forward through the pages the user has visited, for the title bar's buttons. */
export function useNavigationHistory() {
  const { history } = useRouter();

  // The browser does not say whether Forward is possible, so it is worked out from where the current
  // page sits among all entries. The snapshot is a string so that React can compare it by value.
  const position = useSyncExternalStore(
    (onChange) => history.subscribe(onChange),
    () => `${history.location.state.__TSR_index}/${history.length}`,
  );
  const [index = 0, length = 1] = position.split("/").map(Number);

  return {
    canGoBack: index > 0,
    canGoForward: index < length - 1,
    onBack: () => {
      history.back();
    },
    onForward: () => {
      history.forward();
    },
  };
}
