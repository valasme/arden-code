import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function NotFound() {
  const { t } = useTranslation();

  return (
    <main className="flex flex-col items-start gap-3 p-6">
      <p className="text-base">{t("notFound.message")}</p>
      <Link to="/" className="text-sm underline underline-offset-4 hover:no-underline">
        {t("notFound.home")}
      </Link>
    </main>
  );
}
