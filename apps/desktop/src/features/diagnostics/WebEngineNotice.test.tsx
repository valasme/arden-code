import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";

import { Toaster } from "@/components/Toaster";
import type { AppError } from "@/ipc/bindings";

import { WebEngineNotice } from "./WebEngineNotice";

import "@/styles/global.css";

function startApp(notice: AppError | null) {
  Object.assign(globalThis, { isTauri: true });
  mockIPC((command) => (command === "take_web_engine_notice" ? notice : null), {
    shouldMockEvents: true,
  });
}

function renderNotice() {
  return render(
    <>
      <WebEngineNotice />
      <Toaster />
    </>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("The web engine notice", () => {
  it("tells the person the window was started again, with the error code", async () => {
    startApp({
      code: "ARD-WIN-002",
      messageKey: "errors.ARD-WIN-002",
      details: "renderer exited",
    });
    renderNotice();

    await screen.findByText("Notice (ARD-WIN-002)");
    await waitFor(() => {
      expect(screen.getByText("Notice (ARD-WIN-002)")).toBeVisible();
    });
    expect(screen.getByText(/The part of Arden Code that draws the window stopped/)).toBeVisible();
  });

  it("says nothing when nothing happened", async () => {
    startApp(null);
    renderNotice();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByText(/Notice/)).toBeNull();
  });
});
