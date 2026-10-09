import type { UsageLimits, UsageWindow } from "@/ipc/bindings";

/** How near a window is to its limit, for how it is shown (ADR 0043). */
export type UsageLevel = "normal" | "near" | "reached";

/** From this much of a window, it is shown as near its limit. */
const NEAR_PERCENT = 80;

/**
 * The windows to show, from what Claude Code last reported. A window whose reset time has passed
 * starts again: it shows 0% and no reset time until the next answer.
 */
export function shownWindows(limits: UsageLimits, now: Date = new Date()): UsageWindow[] {
  if (limits.report !== "reported") return [];
  return limits.windows.map((window) =>
    window.resetsAt !== null && new Date(window.resetsAt).getTime() <= now.getTime()
      ? { ...window, percent: 0, resetsAt: null, status: "allowed" }
      : window,
  );
}

/** How near a window is to its limit: from 80% or Claude Code's warning, and at 100% or its refusal. */
export function levelOf(window: UsageWindow): UsageLevel {
  if (window.status === "rejected" || window.percent >= 100) return "reached";
  if (window.status === "warning" || window.percent >= NEAR_PERCENT) return "near";
  return "normal";
}
