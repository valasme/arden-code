// PROTOTYPE (#146), never for main: see src/dev/PluginsPrototype.tsx.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { devPagesEnabled } from "@/lib/devPages";

import { PluginsPrototype } from "@/dev/PluginsPrototype";

const searchSchema = z.object({
  variant: z.enum(["A", "B", "C"]).catch("A"),
});

export const Route = createFileRoute("/dev/plugins-prototype")({
  validateSearch: searchSchema,
  // This page exists while developing and in debug builds, never in a release.
  beforeLoad: () => {
    if (!devPagesEnabled) throw notFound();
  },
  component: PluginsPrototypeRoute,
});

function PluginsPrototypeRoute() {
  const { variant } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PluginsPrototype
      variant={variant}
      onVariant={(next) => {
        void navigate({ search: { variant: next }, replace: true });
      }}
    />
  );
}
