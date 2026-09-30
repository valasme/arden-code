import type { Entry } from "@/ipc/bindings";

import { filterEntries, noFilter, sourcesOf } from "./filter";

const entry = (
  level: string,
  source: string,
  message: string,
  code: string | null = null,
): Entry => ({ timestamp: "2026-09-30T14:05:09.123Z", level, source, message, code });

const entries = [
  entry("error", "ui/settings", "Uncaught error: x is undefined", "ARD-APP-002"),
  entry("warn", "arden_settings", "the settings file cannot be used"),
  entry("info", "arden_desktop_lib", "Arden Code started"),
  entry("debug", "arden_desktop_lib", "settings changed"),
  entry("trace", "tao", "event loop turned"),
];

const messages = (found: Entry[]) => found.map((item) => item.message);

describe("filterEntries", () => {
  it("shows everything when nothing is asked for", () => {
    expect(filterEntries(entries, noFilter)).toEqual(entries);
  });

  it("shows a level and the ones more serious", () => {
    expect(messages(filterEntries(entries, { ...noFilter, level: "error" }))).toEqual([
      "Uncaught error: x is undefined",
    ]);
    expect(messages(filterEntries(entries, { ...noFilter, level: "warn" }))).toEqual([
      "Uncaught error: x is undefined",
      "the settings file cannot be used",
    ]);
    expect(filterEntries(entries, { ...noFilter, level: "info" })).toHaveLength(3);
    expect(filterEntries(entries, { ...noFilter, level: "debug" })).toHaveLength(4);
  });

  it("shows one source", () => {
    expect(messages(filterEntries(entries, { ...noFilter, source: "arden_desktop_lib" }))).toEqual([
      "Arden Code started",
      "settings changed",
    ]);
  });

  it("finds text in the message, the source or the code, ignoring case", () => {
    expect(messages(filterEntries(entries, { ...noFilter, text: "SETTINGS" }))).toEqual([
      "Uncaught error: x is undefined", // its source is ui/settings
      "the settings file cannot be used",
      "settings changed",
    ]);
  });

  it("finds an entry by its error code", () => {
    expect(messages(filterEntries(entries, { ...noFilter, text: "ard-app-002" }))).toEqual([
      "Uncaught error: x is undefined",
    ]);
  });

  it("needs every word, wherever each one is", () => {
    expect(messages(filterEntries(entries, { ...noFilter, text: "settings cannot" }))).toEqual([
      "the settings file cannot be used",
    ]);
    expect(filterEntries(entries, { ...noFilter, text: "settings zebra" })).toEqual([]);
  });

  it("combines the filters", () => {
    const found = filterEntries(entries, {
      level: "info",
      source: "arden_desktop_lib",
      text: "started",
    });

    expect(messages(found)).toEqual(["Arden Code started"]);
  });

  it("keeps the order it was given", () => {
    const newestFirst = [entries[2], entries[0]].filter((item) => item !== undefined);

    expect(messages(filterEntries(newestFirst, noFilter))).toEqual([
      "Arden Code started",
      "Uncaught error: x is undefined",
    ]);
  });
});

describe("sourcesOf", () => {
  it("lists each source once, sorted", () => {
    expect(sourcesOf(entries)).toEqual([
      "arden_desktop_lib",
      "arden_settings",
      "tao",
      "ui/settings",
    ]);
  });

  it("is empty for no entries", () => {
    expect(sourcesOf([])).toEqual([]);
  });
});
