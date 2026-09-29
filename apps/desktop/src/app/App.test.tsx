import { createMemoryHistory } from "@tanstack/react-router";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen } from "@testing-library/react";

import { App } from "./App";

describe("App", () => {
  it("shows the app name and version reported by Rust", async () => {
    mockIPC((command) => {
      if (command === "app_info") {
        return { name: "Arden Code", version: "0.1.0" };
      }
      throw new Error(`unexpected command: ${command}`);
    });

    render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);

    expect(await screen.findByRole("heading", { name: "Arden Code 0.1.0" })).toBeVisible();
  });
});
