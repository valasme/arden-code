import type { Catalog, ModelOption, SlashCommand } from "@/ipc/bindings";

import {
  filterSlashCommands,
  menuQuery,
  parseLocalCommand,
  resolveEffort,
  resolveModel,
  sourceOf,
} from "./slashCommands";

function command(name: string, extra: Partial<SlashCommand> = {}): SlashCommand {
  return { name, description: "", argumentHint: "", aliases: [], builtin: false, ...extra };
}

const commands: SlashCommand[] = [
  command("compact", {
    builtin: true,
    argumentHint: "<optional custom summarization instructions>",
  }),
  command("code-review", { builtin: true, aliases: ["review"] }),
  command("add-dir", { builtin: true }),
  command("doctor", { builtin: true }),
  command("__remote-workflow", { builtin: true }),
  command("workflow-launch-exec", { builtin: true }),
  command("mattpocock-skills:tdd", { aliases: ["tdd"], description: "(mattpocock-skills) TDD" }),
  command("mattpocock-skills:grill-me", { aliases: ["grill-me"] }),
  command("mattpocock-skills:grill-with-docs", { aliases: ["grill-with-docs"] }),
  command("docx", { aliases: ["anthropic-skills:docx"] }),
  command("plugin:bio-research:chembl:analyze_compound (MCP)"),
];

const names = (list: SlashCommand[]) => list.map((item) => item.name);

describe("menuQuery", () => {
  it("is what follows a slash at the start of a message that has no space yet", () => {
    expect(menuQuery("/")).toBe("");
    expect(menuQuery("/comp")).toBe("comp");
    expect(menuQuery("/mattpocock-skills:td")).toBe("mattpocock-skills:td");
  });

  it("is nothing once the command has arguments, or for text that is not a command", () => {
    expect(menuQuery("/compact now")).toBeNull();
    expect(menuQuery("/compact\nnow")).toBeNull();
    expect(menuQuery("hello /compact")).toBeNull();
    expect(menuQuery("")).toBeNull();
    expect(menuQuery(" /compact")).toBeNull();
  });
});

describe("filterSlashCommands", () => {
  it("lists every command in Claude Code's order for a bare slash, without the ones that are not for this window", () => {
    expect(names(filterSlashCommands(commands, [], ""))).toEqual([
      "compact",
      "code-review",
      "add-dir",
      "mattpocock-skills:tdd",
      "mattpocock-skills:grill-me",
      "mattpocock-skills:grill-with-docs",
      "docx",
      "plugin:bio-research:chembl:analyze_compound (MCP)",
    ]);
  });

  it("leaves out the commands Claude Code says are bound to its terminal", () => {
    expect(names(filterSlashCommands(commands, ["add-dir"], "")).includes("add-dir")).toBe(false);
    // Until it has said which, the ones it said before are left out.
    expect(names(filterSlashCommands(commands, [], "doc")).includes("doctor")).toBe(false);
  });

  it("matches the start of a name, or of an alias, ignoring the colon and dashes", () => {
    // "analyze_compound" has a word that starts with the letters, so it follows.
    expect(names(filterSlashCommands(commands, [], "comp"))).toEqual([
      "compact",
      "plugin:bio-research:chembl:analyze_compound (MCP)",
    ]);
    expect(names(filterSlashCommands(commands, [], "review"))).toEqual(["code-review"]);
    expect(names(filterSlashCommands(commands, [], "adddir"))).toEqual(["add-dir"]);
    expect(names(filterSlashCommands(commands, [], "tdd"))).toEqual(["mattpocock-skills:tdd"]);
  });

  it("matches the start of a word within a name, after the ones that start with the letters", () => {
    expect(names(filterSlashCommands(commands, [], "grill"))).toEqual([
      "mattpocock-skills:grill-me",
      "mattpocock-skills:grill-with-docs",
    ]);
  });

  it("puts a name that starts with the letters before one that has a word that does", () => {
    const list = [command("pre-commit"), command("commit"), command("committee")];

    expect(names(filterSlashCommands(list, [], "com"))).toEqual([
      "commit",
      "committee",
      "pre-commit",
    ]);
  });

  it("ignores case", () => {
    expect(names(filterSlashCommands(commands, [], "COMP"))[0]).toBe("compact");
  });

  it("finds nothing for letters that match nothing", () => {
    expect(filterSlashCommands(commands, [], "zzz")).toEqual([]);
  });
});

describe("sourceOf", () => {
  it("says built in, the plugin's name, MCP, or a skill of the person's", () => {
    expect(sourceOf(command("compact", { builtin: true }))).toEqual({ kind: "builtin" });
    expect(sourceOf(command("mattpocock-skills:tdd"))).toEqual({
      kind: "plugin",
      name: "mattpocock-skills",
    });
    expect(sourceOf(command("plugin:bio-research:chembl:analyze_compound (MCP)"))).toEqual({
      kind: "mcp",
    });
    expect(sourceOf(command("docx"))).toEqual({ kind: "skill" });
  });
});

describe("parseLocalCommand", () => {
  it("knows the four commands Arden Code runs itself, and their aliases", () => {
    expect(parseLocalCommand("/model opus")).toEqual({ kind: "model", argument: "opus" });
    expect(parseLocalCommand("/effort high")).toEqual({ kind: "effort", argument: "high" });
    expect(parseLocalCommand("/rename A new name")).toEqual({
      kind: "rename",
      argument: "A new name",
    });
    for (const text of ["/clear", "/reset", "/new"]) {
      expect(parseLocalCommand(text)).toEqual({ kind: "clear", argument: "" });
    }
  });

  it("trims the argument and ignores the case of the name", () => {
    expect(parseLocalCommand("/MODEL   sonnet  ")).toEqual({ kind: "model", argument: "sonnet" });
    expect(parseLocalCommand("/model")).toEqual({ kind: "model", argument: "" });
  });

  it("is nothing for another command or for text", () => {
    expect(parseLocalCommand("/compact")).toBeNull();
    expect(parseLocalCommand("/models")).toBeNull();
    expect(parseLocalCommand("model opus")).toBeNull();
    expect(parseLocalCommand("/mattpocock-skills:tdd")).toBeNull();
  });
});

function model(
  value: string,
  displayName: string,
  resolvedModel: string | null = null,
): ModelOption {
  return { value, displayName, description: "", resolvedModel, efforts: [] };
}

const catalog: Catalog = {
  commands: [],
  terminalCommands: [],
  models: [
    model("default", "Default (recommended)", "claude-sonnet-5-5"),
    model("opus", "Opus 5.5", "claude-opus-5-5"),
    model("claude-opus-4-6", "Opus 4.6", "claude-opus-4-6"),
    model("claude-fable-5-1[1m]", "Fable", "claude-fable-5-1"),
  ],
};

describe("resolveModel", () => {
  it("takes a value, a display name or a full id Claude Code lists, in any case", () => {
    expect(resolveModel(catalog, "opus")).toEqual({ model: "opus" });
    expect(resolveModel(catalog, "Opus 4.6")).toEqual({ model: "claude-opus-4-6" });
    expect(resolveModel(catalog, "claude-opus-5-5")).toEqual({ model: "opus" });
    expect(resolveModel(catalog, "fable")).toEqual({ model: "claude-fable-5-1[1m]" });
  });

  it("takes default, and nothing, for Claude Code's own setting", () => {
    expect(resolveModel(catalog, "default")).toEqual({ model: null });
  });

  it("does not take what Claude Code does not list", () => {
    expect(resolveModel(catalog, "gpt")).toBeNull();
    expect(resolveModel(catalog, "")).toBeNull();
  });

  it("takes the four families by their aliases until Claude Code has listed its models", () => {
    const none: Catalog = { commands: [], terminalCommands: [], models: [] };

    expect(resolveModel(none, "Sonnet")).toEqual({ model: "sonnet" });
    expect(resolveModel(none, "gpt")).toBeNull();
  });
});

describe("resolveEffort", () => {
  it("takes Claude Code's words, and auto for its own setting", () => {
    expect(resolveEffort("low")).toEqual({ effort: "low" });
    expect(resolveEffort("XHIGH")).toEqual({ effort: "extraHigh" });
    expect(resolveEffort("max")).toEqual({ effort: "max" });
    expect(resolveEffort("auto")).toEqual({ effort: null });
    expect(resolveEffort("default")).toEqual({ effort: null });
  });

  it("does not take another word", () => {
    expect(resolveEffort("extreme")).toBeNull();
    expect(resolveEffort("")).toBeNull();
  });
});
