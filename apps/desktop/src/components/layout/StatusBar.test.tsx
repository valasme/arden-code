import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { UpdateStatus } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { settingsWith } from "@/test/settings";

import { StatusBar } from "./StatusBar";

import "@/styles/global.css";

function startApp(status: UpdateStatus) {
  Object.assign(globalThis, { isTauri: true });
  const calls: string[] = [];
  mockIPC(
    (command) => {
      calls.push(command);
      if (command === "app_info") {
        return { name: "Arden Code", version: "0.1.0", commit: "x", buildDate: "x" };
      }
      if (command === "get_settings") return settingsWith();
      if (command === "get_update_status") return status;
      return null;
    },
    { shouldMockEvents: true },
  );
  return calls;
}

function renderBar() {
  const root = createRootRoute({ component: () => <StatusBar /> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("The status bar and updates", () => {
  it("says nothing about updates when there is nothing to say", async () => {
    startApp({ state: "idle" });
    renderBar();

    expect(await screen.findByText("Version 0.1.0")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Update ready/ })).toBeNull();
    expect(screen.queryByText(/Downloading an update/)).toBeNull();
  });

  it("says an update is downloading, quietly", async () => {
    startApp({ state: "downloading", version: "2.0.0" });
    renderBar();

    expect(await screen.findByText("Downloading an update…")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Update ready/ })).toBeNull();
  });

  it("offers a restart when an update is ready, and asks Rust to install it on a click", async () => {
    const calls = startApp({ state: "ready", version: "2.0.0" });
    const user = userEvent.setup();
    renderBar();

    await user.click(await screen.findByRole("button", { name: "Update ready: restart" }));

    await waitFor(() => {
      expect(calls).toContain("restart_to_update");
    });
  });

  it("has no accessibility violations with an update ready", async () => {
    startApp({ state: "ready", version: "2.0.0" });
    const { container } = renderBar();
    await screen.findByRole("button", { name: "Update ready: restart" });

    await expectNoAccessibilityViolations(container);
  });
});
