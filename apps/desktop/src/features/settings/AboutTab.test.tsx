import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { z } from "zod";

import { Toaster } from "@/components/ui/sonner";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { AboutTab } from "./AboutTab";
import licenses from "./licenses.gen.json";

import "@/styles/global.css";

function startApp() {
  Object.assign(globalThis, { isTauri: true });
  const calls: { command: string; payload: unknown }[] = [];
  let clipboard = "";
  mockIPC(
    (command, payload) => {
      calls.push({ command, payload });
      if (command === "app_info") {
        return {
          name: "Arden Code",
          version: "0.1.0",
          commit: "abc123def456",
          buildDate: "2026-09-30",
        };
      }
      if (command === "get_system_info") {
        return { windows: "Windows 11 24H2 (build 26100.1234)", webview: "130.0.2849.80" };
      }
      if (command === "plugin:clipboard-manager|write_text") {
        clipboard = z.object({ text: z.string() }).parse(payload).text;
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return { calls, clipboard: () => clipboard };
}

function renderTab() {
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

describe("About", () => {
  it("shows the logo, the version, the build, and the Windows and WebView2 versions", async () => {
    startApp();
    renderTab();

    expect(await screen.findByText("0.1.0")).toBeVisible();
    expect(screen.getByText("abc123def456 (2026-09-30)")).toBeVisible();
    expect(await screen.findByText("Windows 11 24H2 (build 26100.1234)")).toBeVisible();
    expect(screen.getByText("130.0.2849.80")).toBeVisible();
    expect(screen.getByRole("img", { name: "Arden Code" })).toBeVisible();
  });

  it("copies the system information as plain text", async () => {
    const app = startApp();
    const user = userEvent.setup();
    renderTab();
    await screen.findByText("130.0.2849.80");

    await user.click(screen.getByRole("button", { name: "Copy system info" }));

    await waitFor(() => {
      expect(app.clipboard()).toBe(
        [
          "Arden Code 0.1.0",
          "Build: abc123def456 (2026-09-30)",
          "Windows: Windows 11 24H2 (build 26100.1234)",
          "WebView2: 130.0.2849.80",
        ].join("\n"),
      );
    });
    expect(await screen.findByText("System information copied")).toBeInTheDocument();
  });

  it("cannot copy before the information is there", () => {
    Object.assign(globalThis, { isTauri: true });
    mockIPC(() => new Promise(() => {}), { shouldMockEvents: true });
    renderTab();

    expect(screen.getByRole("button", { name: "Copy system info" })).toBeDisabled();
  });

  it("opens the bug reports, the release notes and the privacy statement in the browser", async () => {
    const app = startApp();
    const user = userEvent.setup();
    renderTab();

    await user.click(await screen.findByRole("button", { name: "Report a bug" }));
    await user.click(screen.getByRole("button", { name: "Release notes" }));
    await user.click(screen.getByRole("button", { name: "Read the privacy statement" }));

    await waitFor(() => {
      expect(
        app.calls
          .filter((call) => call.command === "open_project_page")
          .map((call) => call.payload),
      ).toEqual([{ page: "issues" }, { page: "releases" }, { page: "privacy" }]);
    });
  });

  it("says that it collects nothing, that it is MIT licensed, and that it is not affiliated", async () => {
    startApp();
    renderTab();

    expect(await screen.findByText("Arden Code collects nothing.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "MIT license" })).toBeVisible();
    expect(screen.getByText(/^MIT License/)).toBeVisible();
    expect(screen.getByText(/Permission is hereby granted, free of charge/)).toBeVisible();
    expect(
      screen.getByText("Arden Code is not affiliated with Anthropic or OpenAI."),
    ).toBeVisible();
  });
});

describe("About → open-source licenses", () => {
  it("are generated from the real dependencies: the interface and Rust", () => {
    expect(licenses.some((item) => item.name === "react" && item.kind === "npm")).toBe(true);
    expect(licenses.some((item) => item.name === "tauri" && item.kind === "crate")).toBe(true);
    for (const item of licenses) {
      expect(item.license, `${item.name} has a license`).not.toBe("");
      expect(item.version).toMatch(/^\d/);
    }
  });

  it("are listed under a heading that counts them, and can be searched", async () => {
    startApp();
    const user = userEvent.setup();
    renderTab();
    const summary = await screen.findByText(`Open-source licenses (${licenses.length} packages)`);
    await user.click(summary);

    const search = screen.getByRole("searchbox", { name: "Search packages" });
    await user.type(search, "react-dom");

    const rows = await screen.findAllByRole("row");
    expect(rows.length).toBeGreaterThan(1);
    const [, firstMatch] = rows;
    if (!firstMatch) throw new Error("there is no row for the package");
    expect(within(firstMatch).getByText(/react-dom/)).toBeVisible();
  });

  it("show the first hundred and say how many there are", async () => {
    startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByText(/^Open-source licenses/));

    expect(screen.getAllByRole("row")).toHaveLength(101);
    expect(
      screen.getByText(`Showing 100 of ${licenses.length}. Type to narrow the list.`),
    ).toBeVisible();
  });

  it("say so when nothing matches", async () => {
    startApp();
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByText(/^Open-source licenses/));

    await user.type(screen.getByRole("searchbox", { name: "Search packages" }), "zzzzzzzz");

    expect(await screen.findByText("No package matches.")).toBeVisible();
  });
});

describe("About", () => {
  it("has no accessibility violations, also with the licenses open", async () => {
    startApp();
    const user = userEvent.setup();
    const { container } = renderTab();
    await screen.findByText("130.0.2849.80");
    await expectNoAccessibilityViolations(container);

    await user.click(screen.getByText(/^Open-source licenses/));

    await expectNoAccessibilityViolations(container);
  });
});
