import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { z } from "zod";

import type { AppError } from "@/ipc/bindings";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { ErrorScreen } from "./ErrorScreen";

import "@/styles/global.css";

const fromRust: AppError = {
  code: "ARD-WIN-001",
  messageKey: "errors.ARD-WIN-001",
  details: r`handle 1 is invalid at C:\Users\Ada\x`,
};

/** A tagged template that keeps backslashes, for Windows paths in the sample text. */
function r(strings: TemplateStringsArray) {
  return strings.raw.join("");
}

const textPayload = z.object({ text: z.string() });

/** Runs inside Tauri, answers the commands the screen uses, and records what it sent. */
function startApp(overrides: Record<string, (payload: unknown) => unknown> = {}) {
  const calls: { command: string; payload: unknown }[] = [];
  Object.assign(globalThis, { isTauri: true });
  mockIPC((command, payload) => {
    calls.push({ command, payload });
    const handler = overrides[command];
    if (handler) return handler(payload);
    if (command === "app_info") return { name: "Arden Code", version: "0.1.0" };
    if (command === "redact_text") return textPayload.parse(payload).text;
    return null;
  });
  return calls;
}

function renderScreen(error: unknown, onReload = () => {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ErrorScreen error={error} onReload={onReload} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
  vi.restoreAllMocks();
});

describe("ErrorScreen", () => {
  it("shows the code with what happened, why, and what to do", () => {
    startApp();
    renderScreen(fromRust);

    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeVisible();
    expect(screen.getByText("ARD-WIN-001")).toBeVisible();
    expect(screen.getByText("Windows' window menu could not be opened.")).toBeVisible();
    expect(screen.getByText(/Windows did not accept the request/)).toBeVisible();
    expect(screen.getByText(/Use the buttons at the right of the title bar/)).toBeVisible();
  });

  it("shows ARD-APP-002 for an error thrown in the UI", () => {
    startApp();
    renderScreen(new TypeError("x is undefined"));

    expect(screen.getByText("ARD-APP-002")).toBeVisible();
    expect(screen.getByText("The interface hit an error it could not handle.")).toBeVisible();
  });

  it("still helps when the code is one this version of the UI has no text for", () => {
    startApp();
    renderScreen({ code: "ARD-FS-999", messageKey: "errors.ARD-FS-999", details: null });

    expect(screen.getByText("ARD-FS-999")).toBeVisible();
    expect(screen.getByText("Something unexpected went wrong inside Arden Code.")).toBeVisible();
  });

  it("puts the error in the log, with its code, once", async () => {
    const calls = startApp();
    renderScreen(fromRust);

    await waitFor(() => {
      expect(calls.filter((call) => call.command === "log_from_ui")).toHaveLength(1);
    });
    expect(calls.find((call) => call.command === "log_from_ui")?.payload).toMatchObject({
      level: "error",
      code: "ARD-WIN-001",
    });
  });

  it("copies the details after Rust has removed private information from them", async () => {
    startApp({
      redact_text: (payload) => textPayload.parse(payload).text.replace("Ada", "<user>"),
    });
    const user = userEvent.setup();
    renderScreen(fromRust);

    await user.click(screen.getByRole("button", { name: "Copy details" }));

    // userEvent gives the page a clipboard that can be read back.
    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toContain("Error: ARD-WIN-001");
    });
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain("Error: ARD-WIN-001");
    expect(copied).toContain("Arden Code 0.1.0");
    expect(copied).toContain("Details: handle 1 is invalid at C:\\Users\\<user>\\x");
    expect(copied).not.toContain("Ada");
    expect(await screen.findByRole("status")).toHaveTextContent("Copied");
  });

  it("reloads on request", async () => {
    startApp();
    const reloads: string[] = [];
    const user = userEvent.setup();
    renderScreen(fromRust, () => reloads.push("reload"));

    await user.click(screen.getByRole("button", { name: "Reload" }));

    expect(reloads).toEqual(["reload"]);
  });

  it("opens the logs folder", async () => {
    const calls = startApp();
    const user = userEvent.setup();
    renderScreen(fromRust);

    await user.click(screen.getByRole("button", { name: "Open logs" }));

    expect(calls.map((call) => call.command)).toContain("open_logs_folder");
  });

  it("has no accessibility violations", async () => {
    startApp();
    const { container } = renderScreen(fromRust);

    await expectNoAccessibilityViolations(container);
  });

  it("moves focus to its heading so keyboard and screen reader users land on it", () => {
    startApp();
    renderScreen(fromRust);

    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });
});
