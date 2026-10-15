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
  /^-?!?(?:transition(?:-[^!]+)?|(?:animation-)?(?:duration|delay)-[^!]+|ease-[^!]+|animate-(?!spin!?$)[^!]+)!?$/;

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

/**
 * A source's lines without its comments, whose words are not classes. A comment's `*` is followed
 * by a space, a `/` or nothing; a class's, as in `**:`, is not.
 */
const code = (text: string) =>
  text
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\/\*|\*(?:[\s/]|$))/.test(line))
    .join("\n");

function movingClasses(text: string) {
  return code(text)
    .split(/[\s"'`]+/)
    .filter((name) => moving.test(utility(name)));
}

const src = new URL("../", import.meta.url);

function sources() {
  return readdirSync(src, { recursive: true, encoding: "utf8" })
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path));
}

describe("Motion classes", () => {
  it("are not words in a comment", () => {
    expect(
      movingClasses(
        '/**\n * Every transition comes from here.\n */\nclassName="transition-opacity"',
      ),
    ).toEqual(["transition-opacity"]);
  });

  it("are found on a line that starts with a descendant variant", () => {
    expect(movingClasses("className={`\n**:data-[slot=kbd]:transition-colors\n`}")).toEqual([
      "**:data-[slot=kbd]:transition-colors",
    ]);
  });

  it("are found behind their variants, and a spinner is let through", () => {
    expect(
      movingClasses(
        'className="flex hover:transition-colors data-[state=open]:animate-in animate-spin duration-150 ease-out! data-open:animation-duration-open delay-75"',
      ),
    ).toEqual([
      "hover:transition-colors",
      "data-[state=open]:animate-in",
      "duration-150",
      "ease-out!",
      "data-open:animation-duration-open",
      "delay-75",
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

/**
 * What would make a Motion component keep its own pace: a duration, curve or delay written where it
 * is used, or Motion's `animate()` called by hand, which no `MotionConfig` reaches (ADR 0054).
 */
const ownPace = [
  /\b(?:duration|ease|delay)\s*:/,
  /\btransition=\{\{/,
  /\banimate\b[^;]*from "motion/,
];

function ownMotion(text: string) {
  if (!/from "motion\//.test(text)) return [];
  return text.split("\n").filter((line) => ownPace.some((pattern) => pattern.test(line)));
}

describe("Motion transitions", () => {
  it("are found in a file that uses Motion, and only there", () => {
    expect(
      ownMotion(
        'import * as m from "motion/react-m";\n<m.li transition={{ duration: 0.3 }} />\nconst calm = { ease: "linear" };',
      ),
    ).toEqual(["<m.li transition={{ duration: 0.3 }} />", 'const calm = { ease: "linear" };']);
    expect(ownMotion('import { animate } from "motion/react";')).toEqual([
      'import { animate } from "motion/react";',
    ]);
    expect(ownMotion("toast.error(message, { duration: 12_000 });")).toEqual([]);
  });

  it("are written only in lib/motion.ts", () => {
    const strays = sources()
      .filter((path) => path !== "lib/motion.ts")
      .flatMap((path) =>
        ownMotion(readFileSync(new URL(path, src), "utf8")).map(
          (line) => `${path}: ${line.trim()}`,
        ),
      );

    expect(strays).toEqual([]);
  });
});
