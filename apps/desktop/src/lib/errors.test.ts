import { errorReport, isAppError, toAppError } from "./errors";

const rustError = {
  code: "ARD-WIN-001",
  messageKey: "errors.ARD-WIN-001",
  details: "handle 1 is invalid",
} as const;

describe("isAppError", () => {
  it("recognizes an error that came from Rust", () => {
    expect(isAppError(rustError)).toBe(true);
    expect(isAppError({ ...rustError, details: null })).toBe(true);
  });

  it("rejects everything else", () => {
    for (const value of [
      null,
      undefined,
      "ARD-WIN-001",
      new Error("boom"),
      {},
      { code: "ARD-WIN-001" },
      { ...rustError, code: "WIN-001" },
      { ...rustError, code: "ARD-WIN-1" },
      { ...rustError, messageKey: 3 },
      { ...rustError, details: 3 },
    ]) {
      expect(isAppError(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("toAppError", () => {
  it("understands an error that arrives as JSON text, as it does through Tauri's isolation pattern", () => {
    expect(toAppError(JSON.stringify(rustError))).toEqual(rustError);
  });

  it("does not mistake other text for an error from Rust", () => {
    expect(toAppError('{"unrelated":true}').code).toBe("ARD-APP-002");
    expect(toAppError("{ not json").details).toBe("{ not json");
  });

  it("passes an error from Rust through unchanged", () => {
    expect(toAppError(rustError)).toBe(rustError);
  });

  it("turns an error thrown in the UI into ARD-APP-002, keeping what it said", () => {
    expect(toAppError(new TypeError("x is undefined"))).toEqual({
      code: "ARD-APP-002",
      messageKey: "errors.ARD-APP-002",
      details: "TypeError: x is undefined",
    });
  });

  it("turns other thrown values into ARD-APP-002 too", () => {
    expect(toAppError("plain text").details).toBe("plain text");
    expect(toAppError(42).details).toBe("42");
    expect(toAppError({ reason: "odd" }).details).toBe('{"reason":"odd"}');
    expect(toAppError(undefined).details).toBeNull();
    expect(toAppError(null).code).toBe("ARD-APP-002");
  });
});

describe("errorReport", () => {
  it("lists what someone needs to understand the problem", () => {
    const text = errorReport(rustError, {
      what: "The window menu could not be opened.",
      version: "0.1.0",
      page: "/settings/general",
      time: new Date("2026-09-29T20:15:30Z"),
    });

    expect(text).toBe(
      [
        "Arden Code 0.1.0",
        "Error: ARD-WIN-001",
        "The window menu could not be opened.",
        "Details: handle 1 is invalid",
        "Page: /settings/general",
        "Time: 2026-09-29T20:15:30.000Z",
      ].join("\n"),
    );
  });

  it("leaves out what it does not know", () => {
    const text = errorReport(
      { ...rustError, details: null },
      { what: "It failed.", page: "/", time: new Date("2026-01-01T00:00:00Z") },
    );

    expect(text).not.toContain("Details:");
    expect(text.startsWith("Error: ARD-WIN-001")).toBe(true);
  });
});
