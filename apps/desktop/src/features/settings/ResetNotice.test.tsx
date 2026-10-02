import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";

import { Toaster } from "@/components/ui/sonner";
import type { AppError } from "@/ipc/bindings";

import { ResetNotice } from "./ResetNotice";

import "@/styles/global.css";

function startApp(notice: AppError | null) {
  Object.assign(globalThis, { isTauri: true });
  mockIPC((command) => (command === "take_reset_notice" ? notice : null), {
    shouldMockEvents: true,
  });
}

function renderNotice() {
  return render(
    <>
      <ResetNotice />
      <Toaster />
    </>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("The notice of a reset that could not finish", () => {
  it("tells the person, with the error code, that it did not finish", async () => {
    startApp({
      code: "ARD-APP-006",
      messageKey: "errors.ARD-APP-006",
      details: "The process cannot access the file because it is being used by another process.",
    });
    renderNotice();

    await screen.findByText("Notice (ARD-APP-006)");
    await waitFor(() => {
      expect(screen.getByText("Notice (ARD-APP-006)")).toBeVisible();
    });
    expect(screen.getByText(/Arden Code could not finish resetting itself/)).toBeVisible();
  });

  it("says nothing when the reset finished, or none was asked for", async () => {
    startApp(null);
    renderNotice();

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.queryByText(/Notice/)).toBeNull();
  });
});
