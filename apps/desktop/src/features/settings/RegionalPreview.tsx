import { useTranslation } from "react-i18next";

import { useFormatters } from "./useFormatters";

/** The same moment written the way the regional format writes dates, numbers and relative times. */
const example = { date: new Date(Date.UTC(2026, 8, 30, 14, 5)), number: 1_234_567.89 };

/** A sample of the chosen regional format, so a person can see what it does. */
export function RegionalPreview() {
  const { t } = useTranslation();
  const formatters = useFormatters();
  // The relative time counts back from the example, so the sample never changes.
  const relative = formatters.relativeTime(
    new Date(example.date.getTime() - 5 * 60_000),
    example.date,
  );

  return (
    <p className="text-xs text-muted-foreground">
      {t("settings.general.regionalFormat.preview", {
        date: formatters.date(example.date, "UTC"),
        number: formatters.number(example.number),
        relative,
      })}
    </p>
  );
}
