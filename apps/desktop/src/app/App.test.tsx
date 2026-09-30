import { createMemoryHistory } from "@tanstack/react-router";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { expectNoAccessibilityViolations } from "@/test/axe";

import { App } from "./App";

import "@/styles/global.css";

function mockAppInfo() {
  mockIPC((command) => {
    if (command === "app_info") {
      return { name: "Arden Code", version: "0.1.0" };
    }
    throw new Error(`unexpected command: ${command}`);
  });
}

function renderApp(entries = ["/"], initialIndex = entries.length - 1) {
  return render(<App history={createMemoryHistory({ initialEntries: entries, initialIndex })} />);
}

describe("App", () => {
  it("shows the app name and version reported by Rust", async () => {
    mockAppInfo();

    renderApp();

    expect(
      await screen.findByRole("heading", { name: "Real agents are coming. Try the Demo agent." }),
    ).toBeVisible();
  });

  it("puts the title bar above every page", async () => {
    mockAppInfo();

    renderApp();

    expect(await screen.findByRole("banner")).toBeVisible();
    expect(screen.getByRole("main")).toBeVisible();
  });

  it("has no accessibility violations", async () => {
    mockAppInfo();

    const { container } = renderApp();
    await screen.findByRole("heading", { name: "Real agents are coming. Try the Demo agent." });

    await expectNoAccessibilityViolations(container);
  });

  it("moves back and forward through the pages the user has visited", async () => {
    mockAppInfo();
    const user = userEvent.setup();
    renderApp(["/", "/dev/design-system"]);
    await screen.findByRole("heading", { name: "Design system" });
    const back = screen.getByRole("button", { name: "Back" });
    const forward = screen.getByRole("button", { name: "Forward" });

    expect(back).toBeEnabled();
    expect(forward).toBeDisabled();

    await user.click(back);
    expect(
      await screen.findByRole("heading", { name: "Real agents are coming. Try the Demo agent." }),
    ).toBeVisible();
    expect(back).toBeDisabled();
    expect(forward).toBeEnabled();

    await user.click(forward);
    expect(await screen.findByRole("heading", { name: "Design system" })).toBeVisible();
  });
});
