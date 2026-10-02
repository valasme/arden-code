import { emit } from "@tauri-apps/api/event";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cdp, page } from "vitest/browser";
import { z } from "zod";

import { expectNoAccessibilityViolations } from "@/test/axe";

import { TitleBar } from "./TitleBar";

import "@/styles/global.css";

/** Runs the title bar inside a pretend Tauri window and records the commands it sends. */
function startWindow({ maximized = false } = {}) {
  const commands: string[] = [];
  /** Every place the title bar said its Maximize button is, `null` for none. */
  const maximizeButtonAreas: unknown[] = [];
  let isMaximized = maximized;
  Object.assign(globalThis, { isTauri: true });
  mockWindows("main");
  mockIPC(
    (command, payload) => {
      commands.push(command);
      if (command === "plugin:window|is_maximized") return isMaximized;
      if (command === "set_maximize_button") {
        maximizeButtonAreas.push(z.object({ area: z.unknown() }).parse(payload).area);
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return {
    commands,
    maximizeButtonAreas,
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

  it("draws the logo as the app's logo, not a button, and drags the window by it", () => {
    startWindow();
    render(<TitleBar {...navigation} />);
    const logo = screen.getByRole("img", { name: "Arden Code" });
    const { left, top, width, height } = logo.getBoundingClientRect();

    expect(logo.closest("button")).toBeNull();
    // A press on the logo lands on the bar itself, which Tauri drags the window by.
    expect(document.elementFromPoint(left + width / 2, top + height / 2)).toBe(
      screen.getByRole("banner"),
    );
  });

  it("puts the window menu on a button of its own, beside the logo", () => {
    startWindow();
    render(<TitleBar {...navigation} />);
    const logo = screen.getByRole("img", { name: "Arden Code" });
    const menu = screen.getByRole("button", { name: "Window menu" });

    expect(menu).toHaveAttribute("aria-haspopup", "menu");
    expect(menu.contains(logo)).toBe(false);
    expect(logo.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(menu.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      logo.getBoundingClientRect().right,
    );
  });

  it("opens the system menu from its button, from Alt+Space and from a right click on the bar", async () => {
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

  describe("Snap Layouts on the Maximize button", () => {
    beforeEach(async () => {
      await page.viewport(1000, 700);
    });

    afterEach(async () => {
      await cdp().send("Emulation.clearDeviceMetricsOverride");
    });

    it("tells Rust where the Maximize button is, in the screen's pixels", async () => {
      const window = startWindow();
      render(<TitleBar {...navigation} />);

      // 1000 px wide: Close takes the last 46 px, and the 46 by 32 Maximize button is left of it.
      await waitFor(() => {
        expect(window.maximizeButtonAreas.at(-1)).toEqual({ x: 908, y: 0, width: 46, height: 32 });
      });
    });

    it("counts the display scaling of Windows in those pixels", async () => {
      await cdp().send("Emulation.setDeviceMetricsOverride", {
        width: 0,
        height: 0,
        deviceScaleFactor: 1.5,
        mobile: false,
      });
      const window = startWindow();
      render(<TitleBar {...navigation} />);

      await waitFor(() => {
        expect(window.maximizeButtonAreas.at(-1)).toEqual({
          x: 1362,
          y: 0,
          width: 69,
          height: 48,
        });
      });
    });

    it("looks hovered and pressed when Rust says so, as the overlay over it takes the pointer", async () => {
      startWindow();
      render(<TitleBar {...navigation} />);
      const maximize = screen.getByRole("button", { name: "Maximize" });
      const background = () => getComputedStyle(maximize).backgroundColor;
      const resting = background();

      await emit("maximize-button-changed", { look: "hover" });
      await waitFor(() => {
        expect(background()).not.toBe(resting);
      });
      const hovered = background();

      await emit("maximize-button-changed", { look: "pressed" });
      await waitFor(() => {
        expect(background()).not.toBe(hovered);
      });

      await emit("maximize-button-changed", { look: "normal" });
      await waitFor(() => {
        expect(background()).toBe(resting);
      });
    });
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

describe("TitleBar with the title bar of Windows", () => {
  it("leaves the window buttons, the logo, the window menu and the drag area to Windows", () => {
    startWindow();
    render(<TitleBar {...navigation} native />);

    for (const name of ["Minimize", "Maximize", "Close", "Window menu"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("img", { name: "Arden Code" })).toBeNull();
    expect(screen.getByRole("banner")).not.toHaveAttribute("data-tauri-drag-region");
  });

  it("keeps the layout controls it is given", async () => {
    await page.viewport(1280, 800);
    startWindow();
    render(<TitleBar {...navigation} native controls={<button type="button">Sidebar</button>} />);

    expect(screen.getByRole("button", { name: "Sidebar" })).toBeVisible();
  });

  it("keeps back, forward and the search field", async () => {
    const onSearch = vi.fn<() => void>();
    const onBack = vi.fn<() => void>();
    startWindow();
    const user = userEvent.setup();
    render(<TitleBar {...navigation} onSearch={onSearch} onBack={onBack} native />);

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: /^Search or run a command/ }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Forward" })).toBeVisible();
  });

  it("tells Rust there is no Maximize button to cover, as Windows' own has Snap Layouts", async () => {
    const window = startWindow();
    render(<TitleBar {...navigation} native />);

    await waitFor(() => {
      expect(window.maximizeButtonAreas).toContain(null);
    });
    expect(window.maximizeButtonAreas.every((area) => area === null)).toBe(true);
  });

  it("does not take Alt+Space, which Windows handles itself", async () => {
    const window = startWindow();
    const user = userEvent.setup();
    render(<TitleBar {...navigation} native />);

    await user.keyboard("{Alt>} {/Alt}");

    expect(window.commands).not.toContain("show_system_menu");
  });

  it("has no accessibility violations", async () => {
    startWindow();
    const { container } = render(<TitleBar {...navigation} native />);

    await expectNoAccessibilityViolations(container);
  });
});

describe("The pointer", () => {
  it("shows on every button in the bar, the window buttons included, and not on a disabled one", () => {
    startWindow();
    render(<TitleBar {...navigation} canGoForward={false} />);

    for (const name of ["Window menu", "Back", "Minimize", "Maximize", "Close"]) {
      expect(getComputedStyle(screen.getByRole("button", { name })).cursor).toBe("pointer");
    }
    expect(getComputedStyle(screen.getByRole("button", { name: /Search/u })).cursor).toBe(
      "pointer",
    );
    expect(getComputedStyle(screen.getByRole("button", { name: "Forward" })).cursor).not.toBe(
      "pointer",
    );
  });
});

describe("The field that opens the command palette", () => {
  it("is a filled strip with no border, with the palette's shortcut drawn as a key", () => {
    startWindow();
    render(<TitleBar {...navigation} />);
    const field = screen.getByRole("button", { name: /Search or run a command/u });
    const bar = screen.getByRole("banner");

    expect(getComputedStyle(field).borderTopWidth).toBe("0px");
    expect(getComputedStyle(field).backgroundColor).not.toBe(getComputedStyle(bar).backgroundColor);
    expect(field.querySelector("kbd")).toHaveTextContent("Ctrl+K");
  });
});
