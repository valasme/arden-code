import { createFileRoute } from "@tanstack/react-router";

import { Welcome } from "@/features/sessions/Welcome";

export const Route = createFileRoute("/")({
  component: Welcome,
});
