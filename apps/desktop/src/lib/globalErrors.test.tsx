import { mockIPC } from "@tauri-apps/api/mocks";
import { z } from "zod";

import type { AppError } from "@/ipc/bindings";

import { handleUncaughtError, handleUnhandledRejection } from "./globalErrors";
import { logger } from "./logger";

const loggedMessage = z.object({
  level: z.string(),
  source: z.string(),
  message: z.string(),
  code: z.string().nullable(),
});

type LoggedMessage = z.infer<typeof loggedMessage>;

/** Runs as inside Tauri and records what the UI sends to Rust's log. */
function recordLog() {
  Object.assign(globalThis, { isTauri: true });
  const messages: LoggedMessage[] = [];
  mockIPC((command, payload) => {
    if (command === "log_from_ui") messages.push(loggedMessage.parse(payload));
    return null;
  });
  return messages;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("logger", () => {
  it("sends messages to Rust, where they land in the log files", () => {
    const messages = recordLog();

    logger.error("sessions", "could not load", "ARD-APP-001");
    logger.info("sessions", "loaded");

    expect(messages).toEqual([
      { level: "error", source: "sessions", message: "could not load", code: "ARD-APP-001" },
      { level: "info", source: "sessions", message: "loaded", code: null },
    ]);
  });

  it("does not fail outside Tauri, such as in a browser during development", () => {
    Reflect.deleteProperty(globalThis, "isTauri");

    expect(() => {
      logger.error("sessions", "could not load");
    }).not.toThrow();
  });
});

describe("uncaught errors", () => {
  it("logs the error with its code and tells the user", () => {
    const messages = recordLog();
    const notified: AppError[] = [];

    handleUncaughtError(
      new ErrorEvent("error", {
        error: new TypeError("x is undefined"),
        message: "x is undefined",
      }),
      (error) => notified.push(error),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ level: "error", source: "ui", code: "ARD-APP-002" });
    expect(messages[0]?.message).toContain("TypeError: x is undefined");
    expect(notified.map((error) => error.code)).toEqual(["ARD-APP-002"]);
  });

  it("uses the message when the event carries no error object", () => {
    const messages = recordLog();

    handleUncaughtError(new ErrorEvent("error", { message: "Script error." }), () => {});

    expect(messages[0]?.message).toContain("Script error.");
  });
});

describe("the browser's ResizeObserver notice", () => {
  // Browsers raise this as an error event when a layout change had to wait for the next frame.
  // Nothing is broken and nothing is lost, so it is not an error to show or to report.
  it.each([
    "ResizeObserver loop completed with undelivered notifications.",
    "ResizeObserver loop limit exceeded",
  ])("is not shown to the user, and is not logged as an error: %s", (message) => {
    const messages = recordLog();
    const notified: AppError[] = [];

    handleUncaughtError(new ErrorEvent("error", { message }), (error) => notified.push(error));

    expect(notified).toEqual([]);
    expect(messages.filter((entry) => entry.level === "error")).toEqual([]);
  });

  it("does not hide other errors that mention it", () => {
    recordLog();
    const notified: AppError[] = [];

    handleUncaughtError(
      new ErrorEvent("error", {
        error: new TypeError("ResizeObserver is not a constructor"),
        message: "ResizeObserver is not a constructor",
      }),
      (error) => notified.push(error),
    );

    expect(notified).toHaveLength(1);
  });
});

describe("rejected promises nobody handled", () => {
  it("logs the reason and tells the user", () => {
    const messages = recordLog();
    const notified: AppError[] = [];

    handleUnhandledRejection(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: new Error("request failed"),
      }),
      (error) => notified.push(error),
    );

    expect(messages[0]).toMatchObject({ level: "error", source: "ui", code: "ARD-APP-002" });
    expect(messages[0]?.message).toContain("Error: request failed");
    expect(notified).toHaveLength(1);
  });

  it("keeps the code of an error that came from Rust", () => {
    const messages = recordLog();
    const notified: AppError[] = [];
    const fromRust: AppError = {
      code: "ARD-WIN-001",
      messageKey: "errors.ARD-WIN-001",
      details: "handle 1 is invalid",
    };

    handleUnhandledRejection(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: Promise.resolve(),
        reason: fromRust,
      }),
      (error) => notified.push(error),
    );

    expect(messages[0]?.code).toBe("ARD-WIN-001");
    expect(messages[0]?.message).toContain("handle 1 is invalid");
    expect(notified[0]).toBe(fromRust);
  });
});
