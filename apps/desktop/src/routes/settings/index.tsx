import { createFileRoute, redirect } from "@tanstack/react-router";

/** /settings opens the first tab. Remembering the last tab comes with the settings ticket. */
export const Route = createFileRoute("/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/$tab", params: { tab: "general" } });
  },
});
