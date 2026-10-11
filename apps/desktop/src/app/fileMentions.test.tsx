import { createMemoryHistory } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { page } from "vitest/browser";

import type { FileMatch } from "@/ipc/bindings";
import { useLayoutStore } from "@/state/layout";
import { useOverlayStore } from "@/state/overlays";
import { expectNoAccessibilityViolations } from "@/test/axe";
import { folderProject, sessionNamed, startSessionsRust } from "@/test/sessions";

import { App } from "./App";

import "@/styles/global.css";

const projectFiles = ["GLOSSARY.md", "docs/adr/0052-file-mentions.md", "src/main.rs"];

/** Rust's matches, as far as these tests need them: the paths that hold what was typed. */
function matching(projectId: string, query: string): FileMatch[] {
  if (projectId === "elsewhere") return [{ path: "other/notes.md" }];
  return projectFiles
    .filter((path) => path.toLowerCase().includes(query.toLowerCase()))
    .map((path) => ({ path }));
}

type Options = Parameters<typeof startSessionsRust>[0];

async function inSession(options: Options = {}) {
  const rust = startSessionsRust({
    sessions: [sessionNamed("session-1", "Fix the build")],
    files: matching,
    ...options,
  });
  const user = userEvent.setup();
  render(<App history={createMemoryHistory({ initialEntries: ["/session/session-1"] })} />);
  const box = await screen.findByRole("textbox", { name: "Message" });
  return { rust, user, box };
}

const optionNames = () => screen.queryAllByRole("option").map((item) => item.textContent);

beforeEach(async () => {
  await page.viewport(1280, 800);
  useLayoutStore.setState(useLayoutStore.getInitialState());
  useOverlayStore.setState(useOverlayStore.getInitialState());
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
});

describe("File mentions in the message box (ADR 0052)", () => {
  it("lists the project's files that match the letters typed after @, for a Demo agent session too", async () => {
    const { rust, user, box } = await inSession();

    await user.type(box, "Read @glos");

    const list = await screen.findByRole("listbox", { name: "Files" });
    await waitFor(() => {
      expect(
        within(list)
          .getAllByRole("option")
          .map((item) => item.textContent),
      ).toEqual(["GLOSSARY.md"]);
    });
    expect(rust.callsTo("find_files").at(-1)).toEqual({ projectId: "playground", query: "glos" });
  });

  it("counts the matches politely, and says when none match", async () => {
    const { user, box } = await inSession();

    await user.type(box, "@");
    expect((await screen.findAllByText("3 files")).length).toBeGreaterThan(0);
    await user.type(box, "zzz");

    expect((await screen.findAllByText("No matching files")).length).toBeGreaterThan(0);
  });

  it("fills in the path and a space with Enter, and never sends", async () => {
    const { rust, user, box } = await inSession();

    await user.type(box, "Read @0052");
    await screen.findByRole("option", { name: "docs/adr/0052-file-mentions.md" });
    await user.keyboard("{Enter}");

    expect(box).toHaveValue("Read @docs/adr/0052-file-mentions.md ");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(rust.sent()).toHaveLength(0);
  });

  it("moves with the arrow keys, fills in with Tab, and closes with Escape keeping the text", async () => {
    const { user, box } = await inSession();

    await user.type(box, "@");
    await screen.findByRole("option", { name: "src/main.rs" });
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option", { name: "src/main.rs" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{Tab}");
    expect(box).toHaveValue("@src/main.rs ");

    await user.type(box, "@gl");
    await screen.findByRole("option", { name: "GLOSSARY.md" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box).toHaveValue("@src/main.rs @gl");
  });

  it("takes a file with a click", async () => {
    const { user, box } = await inSession();

    await user.type(box, "@main");
    await user.click(await screen.findByRole("option", { name: "src/main.rs" }));

    expect(box).toHaveValue("@src/main.rs ");
  });

  it("sends the mention as typed", async () => {
    const { rust, user, box } = await inSession();

    await user.type(box, "Explain @src/main.rs{Escape}{Enter}");

    await waitFor(() => {
      expect(rust.sent()).toHaveLength(1);
    });
    expect(rust.sent()[0]?.payload).toMatchObject({ text: "Explain @src/main.rs" });
  });

  it("lists the files of a project the person has not trusted yet", async () => {
    const { user, box } = await inSession({
      folders: [folderProject("api", "api", false)],
      sessions: [sessionNamed("session-1", "Fix the build", "api", "claude")],
    });

    await user.type(box, "@glos");

    expect(await screen.findByRole("option", { name: "GLOSSARY.md" })).toBeVisible();
  });

  it("never opens the list while a character is being composed", async () => {
    const { box } = await inSession();

    fireEvent.compositionStart(box);
    fireEvent.change(box, { target: { value: "@" } });

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("has no accessibility violations while it is open", async () => {
    const { user, box } = await inSession();

    await user.type(box, "@");
    await screen.findByRole("option", { name: "GLOSSARY.md" });

    await expectNoAccessibilityViolations(document.body);
  });
});

describe("File mentions on the welcome screen (ADR 0052)", () => {
  it("lists the files of the project chosen there", async () => {
    const rust = startSessionsRust({
      folders: [folderProject("elsewhere", "elsewhere", true)],
      sessions: [{ ...sessionNamed("s1", "Latest", "elsewhere") }],
      files: matching,
    });
    const user = userEvent.setup();
    render(<App history={createMemoryHistory({ initialEntries: ["/"] })} />);
    await screen.findByRole("heading", { level: 1, name: /work on\?/ });
    await screen.findByRole("button", { name: "Project: elsewhere" });

    await user.type(screen.getByRole("textbox", { name: "Message" }), "@");

    expect(await screen.findByRole("option", { name: "other/notes.md" })).toBeVisible();
    expect(rust.callsTo("find_files").at(-1)).toEqual({ projectId: "elsewhere", query: "" });
    expect(optionNames()).toEqual(["other/notes.md"]);
  });
});
