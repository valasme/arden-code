import { createMemoryHistory } from "@tanstack/react-router";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";

import { expectNoAccessibilityViolations } from "@/test/axe";

import { App } from "./App";

function mockAppInfo() {
  mockIPC((command) => {
    if (command === "app_info") {
      return { name: "Arden Code", version: "0.1.0" };
    }
    throw new Error(`unexpected command: ${command}`);
  });
}

function renderApp() {
  return render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
}

describe("App", () => {
  it("shows the app name and version reported by Rust", async () => {
    mockAppInfo();

    renderApp();

    expect(await screen.findByRole("heading", { name: "Arden Code 0.1.0" })).toBeVisible();
  });

  it("has no accessibility violations", async () => {
    mockAppInfo();

    const { container } = renderApp();
    await screen.findByRole("heading", { name: "Arden Code 0.1.0" });

    await expectNoAccessibilityViolations(container);
  });
});
