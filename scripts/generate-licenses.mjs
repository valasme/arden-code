// Lists the open-source packages Arden Code is built with and their licenses, for the About page.
//
//   node scripts/generate-licenses.mjs           writes apps/desktop/src/features/settings/licenses.gen.json
//   node scripts/generate-licenses.mjs --check   fails when the file is out of date
//
// The list comes from the dependencies themselves (pnpm for the interface, Cargo for Rust), so it
// changes only when a dependency does. Paths on this machine are never written.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "apps/desktop/src/features/settings/licenses.gen.json");

// pnpm is a script on Windows and needs a shell to start. Cargo is not, and its arguments (a format
// with a | in it) must not be read by one.
function run(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    shell: command === "pnpm" && process.platform === "win32",
  });
}

/** The packages the interface is built with, from pnpm. */
function npmPackages() {
  const byLicense = JSON.parse(
    run("pnpm", ["--filter", "@arden/desktop", "licenses", "list", "--prod", "--json"]),
  );
  const found = [];
  for (const [license, packages] of Object.entries(byLicense)) {
    for (const { name, versions } of packages) {
      for (const version of versions) found.push({ name, version, license, kind: "npm" });
    }
  }
  return found;
}

/** The crates the app is built with, from Cargo. The app's own crates are left out. */
function crates() {
  const tree = run("cargo", [
    "tree",
    "-p",
    "arden-desktop",
    "-e",
    "normal",
    "--prefix",
    "none",
    "--target",
    "x86_64-pc-windows-msvc",
    "--format",
    "{p}|{l}",
    "--locked",
    // CI sets CARGO_TERM_COLOR=always, and colors would end up in the list.
    "--color",
    "never",
  ]);
  const found = [];
  for (const line of tree.split(/\r?\n/u)) {
    const match = /^(\S+) v(\S+)(?: \(([^)]*)\))?(?: \(\*\))?\|(.*)$/u.exec(line.trim());
    if (!match) continue;
    const [, name, version, source, license] = match;
    // Packages of this repository show their folder; packages from a registry do not.
    if (source && /[\\/]/u.test(source)) continue;
    found.push({ name, version, license: license.trim() || "See the package", kind: "crate" });
  }
  return found;
}

const key = (item) => `${item.kind}:${item.name}@${item.version} (${item.license})`;

function unique(list) {
  const seen = new Map();
  for (const item of list) seen.set(`${item.kind}:${item.name}@${item.version}`, item);
  return [...seen.values()].toSorted(
    (a, b) =>
      a.name.localeCompare(b.name, "en") ||
      a.version.localeCompare(b.version, "en", { numeric: true }),
  );
}

const text = `${JSON.stringify(unique([...npmPackages(), ...crates()]), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = readFileSync(output, "utf8").replaceAll("\r\n", "\n");
  if (current !== text) {
    console.error(
      "licenses.gen.json is out of date. Run `pnpm licenses:build` and commit the result.",
    );
    // Say what differs, so a mismatch on another machine can be understood from its log.
    const now = new Set(JSON.parse(text).map(key));
    const before = new Set(JSON.parse(current).map(key));
    for (const item of now) if (!before.has(item)) console.error(`  new: ${item}`);
    for (const item of before) if (!now.has(item)) console.error(`  gone: ${item}`);
    process.exit(1);
  }
  console.log("licenses.gen.json is up to date.");
} else {
  writeFileSync(output, text);
  console.log(`wrote ${path.relative(root, output)} (${text.split("\n").length - 2} lines)`);
}
