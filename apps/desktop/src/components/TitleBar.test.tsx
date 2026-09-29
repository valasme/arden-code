import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { expectNoAccessibilityViolations } from "@/test/axe";

import { TitleBar } from "./TitleBar";

import "@/styles/global.css";

/** Runs the title bar inside a pretend Tauri window and records the commands it sends. */
function startWindow({ maximized = false } = {}) {
  const commands: string[] = [];
  let isMaximized = maximized;
  Object.assign(globalThis, { isTauri: true });
  mockWindows("main");
  mockIPC(
    (command) => {
      commands.push(command);
      if (command === "plugin:window|is_maximized") return isMaximized;
      return null;
    },
    { shouldMockEvents: true },
  );
  return {
    commands,
    /** Pretends the user maximized or restored the window, as Windows would announce it. */
    async setMaximized(value: boolean) {
      isMaximized = value;
      await emit("tauri://resize", { width: 1000, height: 700 });
    },
  };
}

const navigation = {
  canGoBack: true,
  canGoForward: true,
  onBack: () => {},
  onForward: () => {},
  onSearch: () => {},
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("TitleBar", () => {
  it("has a button for everything the plan lists, each with an accessible name", () => {
    startWindow();
    render(<TitleBar {...navigation} />);

    for (const name of [
      "Window menu",
      "Back",
      "Forward",
      "Search or run a command",
      "Minimize",
      "Maximize",
      "Close",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${name}`) }), name).toBeVisible();
    }
  });

  it("has no accessibility violations", async () => {
    startWindow();
    const { container } = render(<TitleBar {...navigation} />);

    await expectNoAccessibilityViolations(container);
  });

  it("minimizes, maximizes and closes the window", async () => {
    const window = startWindow();
    const user = userEvent.setup();
    render(<TitleBar {...navigation} />);

    await user.click(screen.getByRole("button", { name: "Minimize" }));
    await user.click(screen.getByRole("button", { name: "Maximize" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(window.commands).toEqual(
      expect.arrayContaining([
        "plugin:window|minimize",
        "plugin:window|toggle_maximize",
        "plugin:window|close",
      ]),
    );
  });

  it("offers Restore instead of Maximize while the window is maximized", async () => {
    const window = startWindow({ maximized: true });
    render(<TitleBar {...navigation} />);

    expect(await screen.findByRole("button", { name: "Restore" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Maximize" })).toBeNull();

    await window.setMaximized(false);
    expect(await screen.findByRole("button", { name: "Maximize" })).toBeVisible();
  });

  it("can be dragged by its empty space but not by its buttons", () => {
    startWindow();
    const { container } = render(<TitleBar {...navigation} />);

    expect(container.querySelector("header")).toHaveAttribute("data-tauri-drag-region");
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAttribute("data-tauri-drag-region");
    }
  });

  it("opens the system menu from the logo, from Alt+Space and from a right click on the bar", async () => {
    const window = startWindow();
    const user = userEvent.setup();
    const { container } = render(<TitleBar {...navigation} />);
    const menuCommands = () => window.commands.filter((command) => command === "show_system_menu");

    await user.click(screen.getByRole("button", { name: "Window menu" }));
    expect(menuCommands()).toHaveLength(1);

    await user.keyboard("{Alt>} {/Alt}");
    await waitFor(() => {
      expect(menuCommands()).toHaveLength(2);
    });

    await user.pointer({
      keys: "[MouseRight]",
      target: container.querySelector("header") ?? document.body,
    });
    await waitFor(() => {
      expect(menuCommands()).toHaveLength(3);
    });
  });

  it("disables Back and Forward when there is nowhere to go", () => {
    startWindow();
    render(<TitleBar {...navigation} canGoBack={false} canGoForward={false} />);

    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled();
  });

  it("tells the app when Back, Forward or the search field is used", async () => {
    startWindow();
    const user = userEvent.setup();
    const calls: string[] = [];
    render(
      <TitleBar
        {...navigation}
        onBack={() => calls.push("back")}
        onForward={() => calls.push("forward")}
        onSearch={() => calls.push("search")}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Forward" }));
    await user.click(screen.getByRole("button", { name: /^Search/ }));

    expect(calls).toEqual(["back", "forward", "search"]);
  });
});
