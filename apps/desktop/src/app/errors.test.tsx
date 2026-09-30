import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import type { AppError } from "@/ipc/bindings";
import { showErrorToast } from "@/lib/errorToasts";

import { App } from "./App";
import { AppErrorBoundary } from "./AppErrorBoundary";

import "@/styles/global.css";

function mockRust() {
  mockIPC((command) => {
    if (command === "app_info") return { name: "Arden Code", version: "0.1.0" };
    return null;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  // Toasts live in a global store, so one test's notice would otherwise show up in the next.
  toast.dismiss();
});

function Bomb(): never {
  throw new Error("the whole shell failed");
}

describe("a page that fails", () => {
  it("shows the error screen with its code, and keeps the title bar and sidebar", async () => {
    mockRust();
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<App history={createMemoryHistory({ initialEntries: ["/dev/errors?fail=render"] })} />);

    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeVisible();
    expect(screen.getByText("ARD-APP-002")).toBeVisible();
    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy details" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Open logs" })).toBeVisible();
  });
});

describe("a failure above the pages", () => {
  it("shows the error screen instead of a blank window", () => {
    mockRust();
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <QueryClientProvider client={new QueryClient()}>
        <AppErrorBoundary>
          <Bomb />
        </AppErrorBoundary>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    expect(screen.getByText("ARD-APP-002")).toBeVisible();
  });
});

describe("errors nobody handled", () => {
  it("are listened for by the app", async () => {
    mockRust();
    const listen = vi.spyOn(window, "addEventListener");

    render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
    await screen.findByRole("main");

    const events = listen.mock.calls.map(([type]) => type);
    expect(events).toContain("error");
    expect(events).toContain("unhandledrejection");
  });

  it("appear as a notice with the error code and a way to copy the details", async () => {
    mockRust();
    const error: AppError = {
      code: "ARD-APP-002",
      messageKey: "errors.ARD-APP-002",
      details: "TypeError: x is undefined",
    };
    render(<Toaster />);

    showErrorToast(error);

    // Toasts fade in, so they only count as visible once the animation has started. Toasts live in
    // a global store, so one that an earlier test left there may be showing too: look at the first.
    await waitFor(() => {
      expect(screen.getAllByText("Something went wrong (ARD-APP-002)")[0]).toBeVisible();
      expect(
        screen.getAllByText("The interface hit an error it could not handle.")[0],
      ).toBeVisible();
      expect(screen.getAllByRole("button", { name: "Copy details" })[0]).toBeVisible();
    });
  });
});
