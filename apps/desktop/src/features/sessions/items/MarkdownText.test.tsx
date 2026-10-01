import { mockIPC } from "@tauri-apps/api/mocks";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { z } from "zod";

import { Toaster } from "@/components/ui/sonner";
import { animationsDone } from "@/test/animations";
import { expectNoAccessibilityViolations } from "@/test/axe";

import { MarkdownText } from "./MarkdownText";

import "@/styles/global.css";

function startApp({ failOpen = false }: { failOpen?: boolean } = {}) {
  Object.assign(globalThis, { isTauri: true });
  const opened: { url: string; confirmed: boolean }[] = [];
  mockIPC(
    (command, payload) => {
      if (command === "open_link") {
        const { url, confirmed } = z
          .object({ url: z.string(), confirmed: z.boolean() })
          .parse(payload);
        opened.push({ url, confirmed });
        if (failOpen) {
          throw JSON.stringify({
            code: "ARD-APP-004",
            messageKey: "errors.ARD-APP-004",
            details: null,
          });
        }
      }
      return null;
    },
    { shouldMockEvents: true },
  );
  return opened;
}

function renderText(text: string, streaming = false) {
  return render(
    <>
      <MarkdownText text={text} streaming={streaming} />
      <Toaster />
    </>,
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("Markdown in a reply", () => {
  it("draws headings, emphasis, lists and inline code", async () => {
    startApp();
    renderText("## A heading\n\nSome **bold** and *slanted* text with `code`.\n\n- one\n- two");

    expect(await screen.findByRole("heading", { level: 2, name: "A heading" })).toBeVisible();
    expect(Number(getComputedStyle(screen.getByText("bold")).fontWeight)).toBeGreaterThanOrEqual(
      600,
    );
    expect(getComputedStyle(screen.getByText("slanted")).fontStyle).toBe("italic");
    expect(screen.getByText("code").tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("drops raw HTML instead of drawing it", async () => {
    startApp();
    const { container } = renderText(
      'Before <script>window.hacked = true</script><b onclick="window.hacked = true">bold?</b> <iframe src="https://example.com"></iframe> after',
    );

    await screen.findByText(/Before/);

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect(Reflect.get(window, "hacked")).toBeUndefined();
  });

  it("never loads an image, and says one was left out", async () => {
    startApp();
    const { container } = renderText(
      "![a tracking pixel](https://example.com/pixel.png) and ![](https://example.com/two.png)",
    );

    expect(await screen.findByText("Image not shown: a tracking pixel")).toBeVisible();
    expect(screen.getByText("Image not shown")).toBeVisible();
    expect(container.querySelector("img")).toBeNull();
  });

  it("highlights code and has a button that copies it", async () => {
    startApp();
    const user = userEvent.setup();
    const written: string[] = [];
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation((text) => {
      written.push(text);
      return Promise.resolve();
    });
    const { container } = renderText("```ts\nconst answer: number = 42;\n```");

    // The grammar loads on demand, so the colors arrive a moment after the code.
    await waitFor(() => {
      expect(container.querySelectorAll("code span[style]").length).toBeGreaterThan(2);
    });
    await user.click(await screen.findByRole("button", { name: "Copy code" }));

    await waitFor(() => {
      expect(written).toEqual(["const answer: number = 42;\n"]);
    });
    // The button only swaps its icon; Streamdown says it in words for a screen reader.
    expect(await screen.findByRole("status")).toHaveTextContent("Copied");
  });

  it("lets the keyboard reach code and tables that scroll", async () => {
    startApp();
    renderText("```ts\nconst a = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |");

    const code = await screen.findByRole("region", { name: "Code (ts)" });
    const table = await screen.findByRole("region", { name: "Table" });

    expect(code).toHaveAttribute("tabindex", "0");
    expect(table).toHaveAttribute("tabindex", "0");
  });

  it("draws a table with a button that copies it", async () => {
    startApp();
    renderText("| Item | Shown as |\n| --- | --- |\n| Tool call | A card |");

    expect(await screen.findByRole("columnheader", { name: "Item" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "A card" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy table" })).toBeVisible();
  });

  it("has no accessibility violations, code and all", async () => {
    startApp();
    const { container } = renderText(
      "# Title\n\nText with a [link](https://example.com).\n\n```ts\nconst a = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |",
    );
    await waitFor(() => {
      expect(container.querySelectorAll("code span[style]").length).toBeGreaterThan(0);
    });

    await expectNoAccessibilityViolations(container);
  });
});

describe("Links in a reply", () => {
  it("opens a web address in the default browser at once, and does not navigate the window", async () => {
    const opened = startApp();
    renderText("Read [the docs](https://example.com/docs).");
    const link = await screen.findByRole("link", { name: "the docs" });

    // A click that would navigate the window is cancelled by the page itself.
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    await waitFor(() => {
      expect(opened).toEqual([{ url: "https://example.com/docs", confirmed: false }]);
    });
    expect(click.defaultPrevented).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("does not open a link with the middle button either", async () => {
    const opened = startApp();
    renderText("[the docs](https://example.com/docs)");
    const link = await screen.findByRole("link", { name: "the docs" });

    const event = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(opened).toEqual([]);
  });

  it("shows where a link goes", async () => {
    startApp();
    renderText("[the docs](https://example.com/docs)");

    expect(await screen.findByRole("link", { name: "the docs" })).toHaveAttribute(
      "title",
      "https://example.com/docs",
    );
  });

  it("asks before it opens a link that is not a web address, and opens it once told to", async () => {
    const opened = startApp();
    const user = userEvent.setup();
    renderText("[write to us](mailto:hello@example.com)");

    await user.click(await screen.findByRole("link", { name: "write to us" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Open this link?" });
    await animationsDone(dialog);
    expect(within(dialog).getByText(/mailto:hello@example\.com/)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(opened).toEqual([]);

    await user.click(within(dialog).getByRole("button", { name: "Open link" }));

    await waitFor(() => {
      expect(opened).toEqual([{ url: "mailto:hello@example.com", confirmed: true }]);
    });
  });

  it("opens nothing when the person cancels the question", async () => {
    const opened = startApp();
    const user = userEvent.setup();
    renderText("[write to us](mailto:hello@example.com)");
    await user.click(await screen.findByRole("link", { name: "write to us" }));
    const dialog = await screen.findByRole("alertdialog");
    await animationsDone(dialog);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(opened).toEqual([]);
  });

  it.each([
    ["javascript:alert(1)", "run script"],
    ["file:///C:/Windows/System32/cmd.exe", "run a program"],
    ["data:text/html,hi", "show data"],
  ])("does not make a link of %s", async (address, label) => {
    const opened = startApp();
    const user = userEvent.setup();
    renderText(`[${label}](${address})`);

    const text = await screen.findByText(new RegExp(label, "u"));
    await user.click(text);

    expect(screen.queryByRole("link", { name: new RegExp(label, "u") })).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(opened).toEqual([]);
  });

  it("shows the error code when Windows cannot open a link", async () => {
    startApp({ failOpen: true });
    const user = userEvent.setup();
    renderText("[the docs](https://example.com/docs)");

    await user.click(await screen.findByRole("link", { name: "the docs" }));

    expect(await screen.findByText("Something went wrong (ARD-APP-004)")).toBeInTheDocument();
  });
});

describe("Markdown while a reply streams", () => {
  it("draws a code block that is not closed yet, and finishes it when the rest arrives", async () => {
    startApp();
    const { rerender, container } = renderText("Here is code:\n\n```ts\nconst a = 1;", true);

    await waitFor(() => {
      expect(container.querySelector("code")?.textContent).toContain("const a = 1;");
    });

    rerender(
      <>
        <MarkdownText
          text={"Here is code:\n\n```ts\nconst a = 1;\nconst b = 2;\n```"}
          streaming={false}
        />
        <Toaster />
      </>,
    );

    await waitFor(() => {
      expect(container.querySelector("code")?.textContent).toContain("const b = 2;");
    });
  });
});
