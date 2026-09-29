import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";

import { DesignSystemPage } from "@/dev/DesignSystemPage";

const searchSchema = z.object({
  theme: z.enum(["system", "light", "dark"]).catch("system"),
  zoom: z.union([z.literal(1), z.literal(1.5), z.literal(2)]).catch(1),
});

export const Route = createFileRoute("/dev/design-system")({
  validateSearch: searchSchema,
  // The design system page exists in development builds only.
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DesignSystemRoute,
});

function DesignSystemRoute() {
  const { theme, zoom } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <DesignSystemPage
      theme={theme}
      zoom={zoom}
      onThemeChange={(next) => {
        void navigate({ search: (previous) => ({ ...previous, theme: next }) });
      }}
      onZoomChange={(next) => {
        void navigate({ search: (previous) => ({ ...previous, zoom: next }) });
      }}
    />
  );
}
