import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import type { CheckResult } from "@/ipc/bindings";
import { AboutTab } from "@/features/settings/AboutTab";

import "@/styles/global.css";

function startApp(result: CheckResult | "fail") {
  Object.assign(globalThis, { isTauri: true });
  const calls: string[] = [];
  mockIPC(
    (command) => {
      calls.push(command);
      if (command === "app_info") {
        return {
          name: "Arden Code",
          version: "0.1.0",
          commit: "abc123def456",
          buildDate: "2026-09-30",
        };
      }
      if (command === "get_system_info") return { windows: "Windows 11", webview: "130" };
      if (command === "check_for_updates") {
        if (result === "fail") {
          throw JSON.stringify({
            code: "ARD-APP-001",
            messageKey: "errors.ARD-APP-001",
            details: null,
          });
        }
        return result;
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return calls;
}

function renderAbout() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AboutTab />
      <Toaster />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  toast.dismiss();
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("About → Check for updates", () => {
  it.each([
    ["upToDate", "Arden Code is up to date."],
    ["ready", "An update is ready. Restart Arden Code from the status bar to install it."],
    ["unavailable", "Could not check for updates right now. Try again later."],
    ["rejected", "An update was found, but its signature is not valid, so it was not used."],
    ["busy", "Already looking for updates."],
  ] as const)("reports %s", async (result, message) => {
    const calls = startApp(result);
    const user = userEvent.setup();
    renderAbout();

    await user.click(await screen.findByRole("button", { name: "Check for updates" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(calls.filter((call) => call === "check_for_updates")).toHaveLength(1);
  });

  it("says it is looking while the check goes on, and can be used again after", async () => {
    startApp("upToDate");
    const user = userEvent.setup();
    renderAbout();

    await user.click(await screen.findByRole("button", { name: "Check for updates" }));

    await screen.findByText("Arden Code is up to date.");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Check for updates" })).toBeEnabled();
    });
  });

  it("shows the error code when the check itself fails", async () => {
    startApp("fail");
    const user = userEvent.setup();
    renderAbout();

    await user.click(await screen.findByRole("button", { name: "Check for updates" }));

    expect(await screen.findByText("Something went wrong (ARD-APP-001)")).toBeInTheDocument();
  });
});
