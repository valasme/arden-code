import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { devPagesEnabled } from "@/lib/devPages";

import { ErrorsPlayground } from "@/dev/ErrorsPlayground";

const searchSchema = z.object({
  fail: z.literal("render").optional().catch(undefined),
});

export const Route = createFileRoute("/dev/errors")({
  validateSearch: searchSchema,
  // This page exists while developing and in debug builds, never in a release.
  beforeLoad: () => {
    if (!devPagesEnabled) throw notFound();
  },
  component: ErrorsRoute,
});

function ErrorsRoute() {
  const { fail } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <ErrorsPlayground
      failToDraw={fail === "render"}
      onFailToDraw={() => {
        void navigate({ search: { fail: "render" } });
      }}
    />
  );
}
