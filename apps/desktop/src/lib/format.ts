import type { RegionalFormat } from "@/ipc/bindings";

const fallbackLocale = "en-US";

/**
 * The language tag that dates, numbers and relative times are written in. By default it is the
 * regional format chosen in Windows, which Rust reads: the web engine would otherwise use the
 * language of the interface, and English text would come with English dates for a Greek user.
 */
export function regionalLocale(format: RegionalFormat, windowsLocale: string): string {
  if (format === "english") return fallbackLocale;
  try {
    return Intl.getCanonicalLocales(windowsLocale)[0] ?? fallbackLocale;
  } catch {
    return fallbackLocale;
  }
}

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

/** The relative time unit that fits a distance, and how many of it. Whole units, towards zero. */
function unitFor(milliseconds: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const distance = Math.abs(milliseconds);
  if (distance < 45_000) return { value: 0, unit: "second" };
  if (distance < hour) return { value: Math.trunc(milliseconds / minute), unit: "minute" };
  if (distance < day) return { value: Math.trunc(milliseconds / hour), unit: "hour" };
  if (distance < 30 * day) return { value: Math.trunc(milliseconds / day), unit: "day" };
  if (distance < 365 * day) return { value: Math.trunc(milliseconds / (30 * day)), unit: "month" };
  return { value: Math.trunc(milliseconds / (365 * day)), unit: "year" };
}

/** Writes dates, numbers and relative times the way one locale does. */
export function createFormatters(locale: string) {
  const dateOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  };
  const number = new Intl.NumberFormat(locale);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  return {
    /** A date such as 30/9/2026. `timeZone` is for tests; people see their own. */
    date: (value: Date, timeZone?: string) =>
      new Intl.DateTimeFormat(locale, { ...dateOptions, ...(timeZone && { timeZone }) }).format(
        value,
      ),
    /** A date and a time, such as 30/9/2026, 14:05. */
    dateTime: (value: Date, timeZone?: string) =>
      new Intl.DateTimeFormat(locale, {
        ...dateOptions,
        hour: "numeric",
        minute: "2-digit",
        ...(timeZone && { timeZone }),
      }).format(value),
    number: (value: number) => number.format(value),
    /**
     * When a usage limit resets (ADR 0043): the time when it is today, such as 15:10, else the
     * weekday and the time, such as Tue 09:00.
     */
    resetTime: (value: Date, now: Date = new Date(), timeZone?: string) => {
      const zone = timeZone ? { timeZone } : {};
      const dayOf = new Intl.DateTimeFormat(locale, { ...dateOptions, ...zone });
      const today = dayOf.format(value) === dayOf.format(now);
      return new Intl.DateTimeFormat(locale, {
        ...(today ? {} : { weekday: "short" }),
        hour: "numeric",
        minute: "2-digit",
        ...zone,
      }).format(value);
    },
    /** How long ago (or how far ahead) `value` is from `now`: "5 minutes ago". */
    relativeTime: (value: Date, now: Date = new Date()) => {
      const { value: amount, unit } = unitFor(value.getTime() - now.getTime());
      return relative.format(amount, unit);
    },
  };
}

export type Formatters = ReturnType<typeof createFormatters>;
