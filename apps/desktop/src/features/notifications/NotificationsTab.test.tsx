import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { z } from "zod";

import { Toaster } from "@/components/Toaster";
import type { Settings } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { settingsWith } from "@/test/settings";

import { NotificationsTab } from "./NotificationsTab";

import "@/styles/global.css";

/** Rust as a test double. `shown` is what it answers to a test notification. */
function startApp({ shown = true, fail = false, settings = settingsWith() } = {}) {
  Object.assign(globalThis, { isTauri: true });
  let current: Settings = settings;
  const calls: { command: string; payload: unknown }[] = [];
  mockIPC(
    (command, payload) => {
      calls.push({ command, payload });
      if (command === "get_settings") return current;
      if (command === "change_setting") {
        const { change } = z.object({ change: z.record(z.string(), z.boolean()) }).parse(payload);
        current = {
          ...current,
          notifications: {
            desktop: change["notificationsDesktop"] ?? current.notifications.desktop,
          },
        };
        return current;
      }
      if (command === "send_test_notification") {
        if (fail) {
          throw JSON.stringify({
            code: "ARD-APP-005",
            messageKey: "errors.ARD-APP-005",
            details: "no toast",
          });
        }
        return shown;
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return calls;
}

function renderTab() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NotificationsTab />
      <Toaster />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  toast.dismiss();
  Reflect.deleteProperty(globalThis, "isTauri");
});

const asked = <Call extends { command: string }>(calls: Call[], command: string) =>
  calls.filter((call) => call.command === command);

describe("Settings → Notifications", () => {
  it("has desktop notifications on by default", async () => {
    startApp();
    renderTab();

    expect(await screen.findByRole("switch", { name: "Desktop notifications" })).toBeChecked();
  });

  it("turns them off and on, and saves each choice", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("switch", { name: "Desktop notifications" }));
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Desktop notifications" })).not.toBeChecked();
    });
    await user.click(screen.getByRole("switch", { name: "Desktop notifications" }));

    await waitFor(() => {
      expect(asked(calls, "change_setting").map((call) => call.payload)).toEqual([
        { change: { notificationsDesktop: false } },
        { change: { notificationsDesktop: true } },
      ]);
    });
  });

  it("sends a test notification and says it was sent", async () => {
    const calls = startApp({ shown: true });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Send a test notification" }));

    await waitFor(() => {
      expect(asked(calls, "send_test_notification")).toHaveLength(1);
    });
    expect(await screen.findByText("Test notification sent")).toBeInTheDocument();
  });

  it("says nothing was shown when Rust says notifications are off", async () => {
    startApp({ shown: false, settings: settingsWith({ notifications: { desktop: false } }) });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Send a test notification" }));

    expect(
      await screen.findByText("Notifications are off, so none was shown."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Test notification sent")).toBeNull();
  });

  it("shows the error code when Windows would not show the notification", async () => {
    startApp({ fail: true });
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Send a test notification" }));

    expect(await screen.findByText("Something went wrong (ARD-APP-005)")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    startApp();
    const { container } = renderTab();
    await screen.findByRole("switch", { name: "Desktop notifications" });

    await expectNoAccessibilityViolations(container);
  });
});
