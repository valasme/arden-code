import { mockIPC } from "@tauri-apps/api/mocks";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { z } from "zod";

import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { ContextMenuHost } from "./ContextMenuHost";

import "@/styles/global.css";

interface Rust {
  written: string[];
  clipboard: { text: string };
}

/** The clipboard, as the clipboard plugin keeps it on the Rust side. */
function startApp(initial = ""): Rust {
  Object.assign(globalThis, { isTauri: true });
  const rust: Rust = { written: [], clipboard: { text: initial } };
  mockIPC((command, payload) => {
    if (command === "plugin:clipboard-manager|write_text") {
      const { text } = z.object({ text: z.string() }).parse(payload);
      rust.written.push(text);
      rust.clipboard.text = text;
      return null;
    }
    if (command === "plugin:clipboard-manager|read_text") return rust.clipboard.text;
    return null;
  });
  return rust;
}

function Field({ readOnly = false, type = "text" }: { readOnly?: boolean; type?: string }) {
  const [value, setValue] = useState("hello world");
  return (
    <>
      <input
        aria-label="Name"
        type={type}
        readOnly={readOnly}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <p>Some text that can be selected</p>
      <button type="button">A button</button>
      <ContextMenuHost />
    </>
  );
}

const field = () => {
  const input = document.querySelector("input");
  if (!input) throw new Error("the field is not on the page");
  return input;
};

/** Selects the characters from `start` to `end` in the field, as a person would with the mouse. */
function select(start: number, end: number) {
  const input = field();
  input.focus();
  input.setSelectionRange(start, end);
}

/**
 * A right click on an element. The event is sent as the browser sends it, without a mouse press
 * first: pressing would move the caret and clear the selection, which a real right click on
 * selected text does not.
 */
function rightClick(element: Element) {
  act(() => {
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 60,
        clientY: 40,
      }),
    );
  });
}

const disabled = (name: string) =>
  screen.getByRole("menuitem", { name }).getAttribute("aria-disabled") === "true";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
  window.getSelection()?.removeAllRanges();
});

describe("the context menu of a text field", () => {
  it("opens on a right click with cut, copy, paste and select all", async () => {
    startApp();
    render(<Field />);

    rightClick(field());

    const menu = await screen.findByRole("menu");
    await animationsDone(menu);
    expect(menu).toBeVisible();
    for (const name of ["Cut", "Copy", "Paste", "Select all"]) {
      expect(screen.getByRole("menuitem", { name })).toBeVisible();
    }
  });

  it("opens from the keyboard too: Shift+F10 and the Menu key", async () => {
    startApp();
    const user = userEvent.setup();
    render(<Field />);
    field().focus();

    await user.keyboard("{Shift>}{F10}{/Shift}");
    const menu = await screen.findByRole("menu");
    await animationsDone(menu);
    expect(menu).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
    expect(field()).toHaveFocus();

    await user.keyboard("{ContextMenu}");
    const again = await screen.findByRole("menu");
    await animationsDone(again);
    expect(again).toBeVisible();
  });

  it("moves through the items with the arrow keys and runs one with Enter, giving the field its focus back", async () => {
    const rust = startApp();
    const user = userEvent.setup();
    render(<Field />);
    select(0, 5);
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await screen.findByRole("menu");

    // The menu opens on Cut; Copy is the second item.
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => {
      expect(rust.written).toEqual(["hello"]);
    });
    await waitFor(() => {
      expect(field()).toHaveFocus();
    });
  });

  it("copies the selected text to the clipboard", async () => {
    const rust = startApp();
    const user = userEvent.setup();
    render(<Field />);
    select(6, 11);
    rightClick(field());

    await user.click(await screen.findByRole("menuitem", { name: "Copy" }));

    await waitFor(() => {
      expect(rust.written).toEqual(["world"]);
    });
    expect(field()).toHaveValue("hello world");
  });

  it("cuts the selected text: it goes to the clipboard and out of the field", async () => {
    const rust = startApp();
    const user = userEvent.setup();
    render(<Field />);
    select(5, 11);
    rightClick(field());

    await user.click(await screen.findByRole("menuitem", { name: "Cut" }));

    await waitFor(() => {
      expect(field()).toHaveValue("hello");
    });
    expect(rust.written).toEqual([" world"]);
  });

  it("pastes the clipboard at the caret", async () => {
    startApp("there ");
    const user = userEvent.setup();
    render(<Field />);
    select(6, 6);
    rightClick(field());

    await user.click(await screen.findByRole("menuitem", { name: "Paste" }));

    await waitFor(() => {
      expect(field()).toHaveValue("hello there world");
    });
  });

  it("pastes over the selected text", async () => {
    startApp("everyone");
    const user = userEvent.setup();
    render(<Field />);
    select(6, 11);
    rightClick(field());

    await user.click(await screen.findByRole("menuitem", { name: "Paste" }));

    await waitFor(() => {
      expect(field()).toHaveValue("hello everyone");
    });
  });

  it("selects all of the text", async () => {
    startApp();
    const user = userEvent.setup();
    render(<Field />);
    field().focus();
    rightClick(field());

    await user.click(await screen.findByRole("menuitem", { name: "Select all" }));

    await waitFor(() => {
      expect(field().selectionStart).toBe(0);
      expect(field().selectionEnd).toBe(11);
    });
    await waitFor(() => {
      expect(field()).toHaveFocus();
    });
  });

  it("cannot cut or copy when nothing is selected", async () => {
    startApp();
    render(<Field />);
    select(3, 3);

    rightClick(field());

    await screen.findByRole("menu");
    expect(disabled("Cut")).toBe(true);
    expect(disabled("Copy")).toBe(true);
    expect(disabled("Paste")).toBe(false);
  });

  it("cannot cut or paste in a field that is read-only, but can copy", async () => {
    startApp();
    render(<Field readOnly />);
    select(0, 5);

    rightClick(field());

    await screen.findByRole("menu");
    expect(disabled("Cut")).toBe(true);
    expect(disabled("Paste")).toBe(true);
    expect(disabled("Copy")).toBe(false);
  });

  it("does not copy or cut a password", async () => {
    startApp();
    render(<Field type="password" />);
    select(0, 5);

    rightClick(field());

    await screen.findByRole("menu");
    expect(disabled("Cut")).toBe(true);
    expect(disabled("Copy")).toBe(true);
  });

  it("has no accessibility violations while open", async () => {
    startApp();
    render(<Field />);
    rightClick(field());
    // The menu fades in; its colors are only final once it has finished.
    await animationsDone(await screen.findByRole("menu"));

    await expectNoAccessibilityViolations(document.body);
  });
});

describe("the context menu elsewhere", () => {
  it("offers Copy for selected text on the page", async () => {
    const rust = startApp();
    const user = userEvent.setup();
    render(<Field />);
    const paragraph = screen.getByText("Some text that can be selected");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    rightClick(paragraph);

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Copy"]);
    const [copy] = items;
    if (!copy) throw new Error("there is no Copy item");
    await user.click(copy);
    await waitFor(() => {
      expect(rust.written).toEqual(["Some text that can be selected"]);
    });
  });

  it("opens no menu on something that has nothing to offer", async () => {
    startApp();
    render(<Field />);
    window.getSelection()?.removeAllRanges();

    rightClick(screen.getByRole("button", { name: "A button" }));

    expect(screen.queryByRole("menu")).toBeNull();
  });
});
