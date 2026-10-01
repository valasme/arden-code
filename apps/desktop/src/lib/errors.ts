import { z } from "zod";

import type { AppError } from "@/ipc/bindings";

/** The code for any error that starts in the UI rather than in Rust. */
const uiFailureCode = "ARD-APP-002";

const appErrorShape = z.object({
  code: z.string().regex(/^ARD-[A-Z]+-\d{3}$/),
  messageKey: z.string(),
  details: z.string().nullable(),
});

/** Whether a thrown value is a typed error from Rust: a code, a message key and optional details. */
export function isAppError(value: unknown): value is AppError {
  return appErrorShape.safeParse(value).success;
}

function describe(value: unknown): string | null {
  switch (typeof value) {
    case "undefined":
      return null;
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    case "object":
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      try {
        return JSON.stringify(value);
      } catch {
        return "[an object that cannot be written out]";
      }
    default:
      return `[a ${typeof value}]`;
  }
}

/** Any thrown value as a typed error. Errors from Rust pass through; the rest become ARD-APP-002. */
/** Tauri's isolation pattern hands errors from Rust to the UI as JSON text. */
function parseJsonError(value: unknown): AppError | undefined {
  if (typeof value !== "string" || !value.startsWith("{")) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isAppError(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  const fromJson = parseJsonError(value);
  if (fromJson) return fromJson;
  return { code: uiFailureCode, messageKey: `errors.${uiFailureCode}`, details: describe(value) };
}

interface ErrorReportContext {
  /** What happened, in words, in the user's language. */
  what: string;
  version?: string | undefined;
  page: string;
  time: Date;
}

/** The text that "Copy details" puts on the clipboard. */
export function errorReport(error: AppError, context: ErrorReportContext): string {
  return [
    context.version ? `Arden Code ${context.version}` : undefined,
    `Error: ${error.code}`,
    context.what,
    error.details ? `Details: ${error.details}` : undefined,
    `Page: ${context.page}`,
    `Time: ${context.time.toISOString()}`,
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}
