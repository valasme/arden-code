import type { Catalog, Effort, ModelOption } from "@/ipc/bindings";

import { allEfforts, effortsFor, splitModels } from "./claudeCatalog";

const five: Effort[] = ["low", "medium", "high", "extraHigh", "max"];

function model(value: string, efforts: Effort[] = five): ModelOption {
  return { value, displayName: value, description: "", resolvedModel: null, efforts };
}

/** The models of Claude Code 2.1.292: the families first, then the older versions. */
const current: ModelOption[] = [
  model("default"),
  model("opus"),
  model("sonnet"),
  model("fable"),
  model("haiku", []),
  model("claude-sonnet-5"),
  model("claude-opus-4-8"),
  model("claude-opus-4-6", ["low", "medium", "high", "max"]),
];

/** The models of Claude Code 2.1.286: Fable has a full id, and nothing is older. */
const earlier: ModelOption[] = [
  model("default"),
  model("opus"),
  model("claude-fable-5-1[1m]"),
  model("sonnet"),
  model("haiku", []),
];

function catalog(models: ModelOption[]): Catalog {
  return { commands: [], models, terminalCommands: [] };
}

describe("splitModels", () => {
  it("lists the families first, and the models after the last family as older", () => {
    const { listed, older } = splitModels(current);

    expect(listed.map((row) => row.value)).toEqual(["opus", "sonnet", "fable", "haiku"]);
    expect(older.map((row) => row.value)).toEqual([
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-opus-4-6",
    ]);
  });

  it("keeps a family that has a full id among the families", () => {
    const { listed, older } = splitModels(earlier);

    expect(listed.map((row) => row.value)).toEqual([
      "opus",
      "claude-fable-5-1[1m]",
      "sonnet",
      "haiku",
    ]);
    expect(older).toEqual([]);
  });

  it("has nothing to list when Claude Code has said nothing", () => {
    expect(splitModels([])).toEqual({ listed: [], older: [] });
  });
});

describe("effortsFor", () => {
  it("is every effort until Claude Code has listed its models", () => {
    expect(effortsFor(catalog([]), "opus")).toEqual(allEfforts);
  });

  it("is the efforts of the chosen model, and of the Default model for Default", () => {
    expect(effortsFor(catalog(current), "claude-opus-4-6")).toEqual([
      "low",
      "medium",
      "high",
      "max",
    ]);
    expect(effortsFor(catalog(current), null)).toEqual(five);
  });

  it("is none for a model that has no effort", () => {
    expect(effortsFor(catalog(current), "haiku")).toEqual([]);
  });

  it("is every effort for a model that is not in the list, which Claude Code may still run", () => {
    expect(effortsFor(catalog(current), "claude-opus-3")).toEqual(allEfforts);
  });
});
