import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { appInfoQuery } from "@/ipc/queries";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(appInfoQuery),
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(appInfoQuery);

  return (
    <main>
      <h1>{t("home.title", { name: data.name, version: data.version })}</h1>
    </main>
  );
}
