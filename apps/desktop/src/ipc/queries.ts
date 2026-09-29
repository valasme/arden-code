import { queryOptions } from "@tanstack/react-query";

import { commands } from "./bindings";

/** The product name and version. They never change while the app runs. */
export const appInfoQuery = queryOptions({
  queryKey: ["app-info"],
  queryFn: () => commands.appInfo(),
  staleTime: Number.POSITIVE_INFINITY,
});
