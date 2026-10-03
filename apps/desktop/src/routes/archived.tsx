import { createFileRoute } from "@tanstack/react-router";

import { ArchivedSessions } from "@/features/sessions/ArchivedSessions";

export const Route = createFileRoute("/archived")({
  component: ArchivedSessions,
});
