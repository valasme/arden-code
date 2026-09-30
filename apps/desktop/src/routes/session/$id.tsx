import { createFileRoute } from "@tanstack/react-router";

import { SessionView } from "@/features/sessions/SessionView";

export const Route = createFileRoute("/session/$id")({
  component: SessionRoute,
});

function SessionRoute() {
  const { id } = Route.useParams();
  // A new key gives every session its own state, such as the box that is focused when it opens.
  return <SessionView key={id} id={id} />;
}
