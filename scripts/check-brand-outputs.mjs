// Fails when the brand files on disk differ from what `pnpm brand:build` produces.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const generated = [
  "brand/assets",
  "apps/desktop/public/brand",
  "apps/desktop/src-tauri/icons",
  "apps/desktop/src-tauri/installer",
  "apps/desktop/src/components/brand/logo-shapes.gen.ts",
];

function files(target) {
  const full = path.join(root, target);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [target];
  return readdirSync(full, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
}

/** File path to content hash. */
function snapshot() {
  const result = new Map();
  for (const file of generated.flatMap(files)) {
    result.set(
      file.replaceAll("\\", "/"),
      createHash("sha1")
        .update(readFileSync(path.join(root, file)))
        .digest("hex"),
    );
  }
  return result;
}

const before = snapshot();
execFileSync(process.execPath, [path.join(root, "brand/src/build.ts")], {
  cwd: root,
  stdio: "inherit",
});
const after = snapshot();

const stale = [...new Set([...before.keys(), ...after.keys()])]
  .filter((file) => before.get(file) !== after.get(file))
  .toSorted((a, b) => a.localeCompare(b));

if (stale.length > 0) {
  console.error(
    "Brand outputs are out of date. Run `pnpm brand:build` and commit the result. Stale files:",
  );
  for (const file of stale) console.error(`  ${file}`);
  process.exit(1);
}
console.log("Brand outputs are up to date.");
