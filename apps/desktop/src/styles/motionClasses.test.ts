import { readdirSync, readFileSync } from "node:fs";

/**
 * Only overlays move (ADR 0054), so only their components may say how. A component copied from
 * shadcn often brings a transition of its own; this keeps it out without a review remembering to.
 */
const overlays = new Set([
  "components/ConfirmDialog.tsx",
  "components/ui/dialog.tsx",
  "components/ui/dropdown-menu.tsx",
  "components/ui/popover.tsx",
  "components/ui/tooltip.tsx",
]);

/** Utilities that make an element move. A spinner may turn anywhere (ADR 0054). */
const moving =
  /^-?!?(?:transition(?:-[^!]+)?|duration-[^!]+|ease-[^!]+|animate-(?!spin!?$)[^!]+)!?$/;

/** The utility a class names, without its variants: `data-[state=open]:animate-in` is `animate-in`. */
function utility(name: string) {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < name.length; index += 1) {
    const character = name[index];
    if (character === "[" || character === "(") depth += 1;
    else if (character === "]" || character === ")") depth -= 1;
    else if (character === ":" && depth === 0) start = index + 1;
  }
  return name.slice(start);
}

function movingClasses(text: string) {
  return text.split(/[\s"'`]+/).filter((name) => moving.test(utility(name)));
}

const src = new URL("../", import.meta.url);

function sources() {
  return readdirSync(src, { recursive: true, encoding: "utf8" })
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path));
}

describe("Motion classes", () => {
  it("are found behind their variants, and a spinner is let through", () => {
    expect(
      movingClasses(
        'className="flex hover:transition-colors data-[state=open]:animate-in animate-spin duration-150 ease-out!"',
      ),
    ).toEqual([
      "hover:transition-colors",
      "data-[state=open]:animate-in",
      "duration-150",
      "ease-out!",
    ]);
  });

  it("appear only in the overlays' components", () => {
    const strays = sources()
      .filter((path) => !overlays.has(path))
      .flatMap((path) =>
        movingClasses(readFileSync(new URL(path, src), "utf8")).map((name) => `${path}: ${name}`),
      );

    expect(strays).toEqual([]);
  });
});
