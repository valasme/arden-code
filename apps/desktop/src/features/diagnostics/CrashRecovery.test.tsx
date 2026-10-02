import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Toaster } from "@/components/Toaster";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { CrashRecovery } from "./CrashRecovery";

import "@/styles/global.css";

function startApp({ crashes = ["crash-1.json"] }: { crashes?: string[] } = {}) {
  Object.assign(globalThis, { isTauri: true });
  const calls: string[] = [];
  mockIPC(
    (command) => {
      calls.push(command);
      if (command === "pending_crashes") return crashes;
      if (command === "export_diagnostics") return "C:\\Users\\Ada\\diagnostics.zip";
      return null;
    },
    { shouldMockEvents: true },
  );
  return calls;
}

function renderRecovery() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <CrashRecovery />
      <Toaster />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Crash recovery", () => {
  it("asks nothing when the last run ended well", async () => {
    const calls = startApp({ crashes: [] });
    renderRecovery();

    await waitFor(() => {
      expect(calls).toContain("pending_crashes");
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("offers to export diagnostics after a crash, with Not now in front", async () => {
    startApp();
    renderRecovery();

    const dialog = await screen.findByRole("alertdialog", {
      name: "Arden Code closed unexpectedly",
    });
    await animationsDone(dialog);
    expect(within(dialog).getByRole("button", { name: "Not now" })).toHaveFocus();
    await expectNoAccessibilityViolations(document.body);
  });

  it("exports, marks the crash as seen, and says where the file went", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderRecovery();
    const dialog = await screen.findByRole("alertdialog");
    await animationsDone(dialog);

    await user.click(within(dialog).getByRole("button", { name: "Export diagnostics" }));

    await screen.findByText(/^Diagnostics exported to C:/);
    expect(calls).toContain("acknowledge_crashes");
    expect(calls).toContain("export_diagnostics");
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("marks the crash as seen on Not now, and exports nothing", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderRecovery();
    const dialog = await screen.findByRole("alertdialog");
    await animationsDone(dialog);

    await user.click(within(dialog).getByRole("button", { name: "Not now" }));

    await waitFor(() => {
      expect(calls).toContain("acknowledge_crashes");
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(calls).not.toContain("export_diagnostics");
  });

  it("marks the crash as seen on Esc too", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderRecovery();
    await screen.findByRole("alertdialog");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(calls).toContain("acknowledge_crashes");
    });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });
});
