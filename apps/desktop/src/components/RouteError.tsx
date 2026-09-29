import type { ErrorComponentProps } from "@tanstack/react-router";

import { ErrorScreen } from "./ErrorScreen";

/** What a page shows when it fails. The title bar and sidebar around it keep working. */
export function RouteError({ error }: ErrorComponentProps) {
  return <ErrorScreen error={error} />;
}
