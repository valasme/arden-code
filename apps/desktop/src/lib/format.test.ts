import { createFormatters, regionalLocale } from "./format";

// A fixed moment, so what is written does not depend on when the test runs.
const day = new Date(Date.UTC(2026, 8, 30, 14, 5, 9));
const now = new Date(Date.UTC(2026, 8, 30, 14, 10, 9));

describe("regionalLocale", () => {
  it("is the Windows regional format when the setting follows Windows", () => {
    expect(regionalLocale("windows", "el-GR")).toBe("el-GR");
    expect(regionalLocale("windows", "en-GB")).toBe("en-GB");
  });

  it("is English (US) when the setting says so, whatever Windows uses", () => {
    expect(regionalLocale("english", "el-GR")).toBe("en-US");
  });

  it("falls back to English (US) for a tag that does not exist", () => {
    expect(regionalLocale("windows", "not a locale")).toBe("en-US");
    expect(regionalLocale("windows", "")).toBe("en-US");
  });
});

describe("dates", () => {
  it("are written the way the regional format writes them, not the way the interface language does", () => {
    expect(createFormatters("en-US").date(day, "UTC")).toBe("9/30/2026");
    expect(createFormatters("en-GB").date(day, "UTC")).toBe("30/09/2026");
    expect(createFormatters("el-GR").date(day, "UTC")).toBe("30/9/2026");
    expect(createFormatters("de-DE").date(day, "UTC")).toBe("30.9.2026");
    expect(createFormatters("ja-JP").date(day, "UTC")).toBe("2026/9/30");
  });

  it("can include the time", () => {
    expect(createFormatters("en-US").dateTime(day, "UTC")).toBe("9/30/2026, 2:05 PM");
    expect(createFormatters("de-DE").dateTime(day, "UTC")).toBe("30.9.2026, 14:05");
  });
});

describe("numbers", () => {
  it("use the regional grouping and decimal marks", () => {
    expect(createFormatters("en-US").number(1234567.891)).toBe("1,234,567.891");
    expect(createFormatters("de-DE").number(1234567.891)).toBe("1.234.567,891");
    expect(createFormatters("fr-FR").number(1234567.891)).toBe("1 234 567,891");
    expect(createFormatters("en-IN").number(1234567.891)).toBe("12,34,567.891");
  });
});

describe("token counts", () => {
  it("are short, as a context window's figures are read at a glance", () => {
    const { tokens } = createFormatters("en-US");
    expect([tokens(950), tokens(26_000), tokens(17_117), tokens(1_000_000)]).toEqual([
      "950",
      "26K",
      "17.1K",
      "1M",
    ]);
  });
});

describe("relative times", () => {
  it("say how long ago, in the regional language", () => {
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000);

    expect(createFormatters("en-US").relativeTime(fiveMinutesAgo, now)).toBe("5 minutes ago");
    expect(createFormatters("de-DE").relativeTime(fiveMinutesAgo, now)).toBe("vor 5 Minuten");
    expect(createFormatters("el-GR").relativeTime(fiveMinutesAgo, now)).toBe("πριν από 5 λεπτά");
  });

  it("choose the unit that fits", () => {
    const formatters = createFormatters("en-US");
    const ago = (ms: number) => formatters.relativeTime(new Date(now.getTime() - ms), now);

    expect(ago(10_000)).toBe("now");
    expect(ago(60_000)).toBe("1 minute ago");
    expect(ago(3 * 3_600_000)).toBe("3 hours ago");
    expect(ago(86_400_000)).toBe("yesterday");
    expect(ago(3 * 86_400_000)).toBe("3 days ago");
    expect(ago(45 * 86_400_000)).toBe("last month");
    expect(ago(800 * 86_400_000)).toBe("2 years ago");
  });

  it("also work for the future", () => {
    const later = new Date(now.getTime() + 2 * 3_600_000);

    expect(createFormatters("en-US").relativeTime(later, now)).toBe("in 2 hours");
  });
});

describe("reset times", () => {
  it("are a time when they fall today, and a weekday and a time when they fall later", () => {
    const formatters = createFormatters("en-US");
    const today = new Date(Date.UTC(2026, 8, 30, 15, 10));
    const tuesday = new Date(Date.UTC(2026, 9, 6, 9, 0));

    expect(formatters.resetTime(today, now, "UTC")).toBe("3:10 PM");
    expect(formatters.resetTime(tuesday, now, "UTC")).toBe("Tue 9:00 AM");
  });

  it("follow the regional format", () => {
    const formatters = createFormatters("de-DE");
    const tuesday = new Date(Date.UTC(2026, 9, 6, 9, 0));

    expect(formatters.resetTime(new Date(Date.UTC(2026, 8, 30, 15, 10)), now, "UTC")).toBe("15:10");
    expect(formatters.resetTime(tuesday, now, "UTC")).toBe("Di., 09:00");
  });
});
