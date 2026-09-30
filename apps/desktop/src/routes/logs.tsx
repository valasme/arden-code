import { createFileRoute } from "@tanstack/react-router";

import { LogViewer } from "@/features/logs/LogViewer";

export const Route = createFileRoute("/logs")({
  component: LogViewer,
});
