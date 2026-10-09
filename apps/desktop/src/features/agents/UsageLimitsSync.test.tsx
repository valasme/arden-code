import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, waitFor } from "@testing-library/react";

import type { UsageLimits } from "@/ipc/bindings";
import { usageLimitsQuery } from "@/ipc/queries";

import { UsageLimitsSync } from "./UsageLimitsSync";

const reported: UsageLimits = {
  report: "reported",
  windows: [{ kind: "fiveHour", percent: 57, resetsAt: null, status: "allowed" }],
};

function start() {
  Object.assign(globalThis, { isTauri: true });
  const calls: { command: string; payload: unknown }[] = [];
  mockIPC(
    (command, payload) => {
      calls.push({ command, payload });
      return null;
    },
    { shouldMockEvents: true },
  );
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <UsageLimitsSync />
    </QueryClientProvider>,
  );
  return { calls, queryClient };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Keeping the usage limits current", () => {
  it("keeps the usage limits Claude Code reports", async () => {
    const { queryClient } = start();

    await waitFor(async () => {
      await emit("usage-limits-changed", { limits: reported });
      expect(queryClient.getQueryData(usageLimitsQuery.queryKey)).toEqual(reported);
    });
  });

  it("asks Claude Code again when the window comes back into focus", async () => {
    const { calls } = start();

    globalThis.dispatchEvent(new FocusEvent("focus"));

    await waitFor(() => {
      expect(
        calls.filter((call) => call.command === "refresh_usage_limits").map((c) => c.payload),
      ).toEqual([{ onFocus: true }]);
    });
  });
});
