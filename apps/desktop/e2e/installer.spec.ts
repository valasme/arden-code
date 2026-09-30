// Tests the installer that `pnpm --filter @arden/desktop exec tauri build` makes. They install it
// silently into a folder of their own, look at what it did to the user's PATH, and uninstall it
// again. The PATH is put back exactly as it was, whatever happens.
//
//   pnpm --filter @arden/desktop test:e2e:installer

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const bundle = path.join(repoRoot, "target", "release", "bundle", "nsis");

function installerPath(): string {
  const name = readdirSync(bundle).find((file) => file.endsWith("-setup.exe"));
  if (!name) throw new Error(`No installer in ${bundle}. Build it with tauri build.`);
  return path.join(bundle, name);
}

/** The user's PATH as it is stored, with the kind of value it is. */
function userPath(): { kind: string; value: string } | undefined {
  const result = spawnSync("reg", ["query", String.raw`HKCU\Environment`, "/v", "Path"], {
    encoding: "utf8",
  });
  const line = result.stdout.split(/\r?\n/u).find((text) => /^\s+Path\s+REG_/u.test(text));
  const match = line ? /^\s+Path\s+(REG_\w+)\s+(.*)$/u.exec(line) : null;
  return match ? { kind: match[1] ?? "", value: match[2] ?? "" } : undefined;
}

function restorePath(before: { kind: string; value: string } | undefined) {
  if (!before) return;
  execFileSync("reg", [
    "add",
    String.raw`HKCU\Environment`,
    "/v",
    "Path",
    "/t",
    before.kind,
    "/d",
    before.value,
    "/f",
  ]);
}

const folders = (list: string) => list.split(";").map((entry) => entry.trim().toLowerCase());

/** Waits for the uninstaller, which hands over to a copy of itself and returns at once. */
async function untilGone(folder: string) {
  await expect.poll(() => existsSync(folder), { timeout: 60_000 }).toBe(false);
}

test.describe.configure({ mode: "serial" });

test.describe("the installer", () => {
  let before: ReturnType<typeof userPath>;
  let installed: string | undefined;

  test.beforeAll(() => {
    before = userPath();
  });

  test.afterEach(() => {
    if (installed && existsSync(path.join(installed, "uninstall.exe"))) {
      spawnSync(path.join(installed, "uninstall.exe"), ["/S"]);
    }
    installed = undefined;
    restorePath(before);
  });

  function install(...extra: string[]): string {
    const folder = path.join(mkdtempSync(path.join(tmpdir(), "arden-e2e-install-")), "app");
    // The installer needs no administrator: this runs as the ordinary user.
    const result = spawnSync(installerPath(), ["/S", ...extra, `/D=${folder}`], {
      timeout: 120_000,
    });
    expect(result.status, "the installer ends well").toBe(0);
    installed = folder;
    return folder;
  }

  test("installs per user, with the terminal command, and puts it on the PATH", async () => {
    const folder = install();

    expect(existsSync(path.join(folder, "arden-code.exe"))).toBe(true);
    expect(existsSync(path.join(folder, "bin", "arden-code.exe"))).toBe(true);
    const after = userPath();
    expect(folders(after?.value ?? "")).toContain(path.join(folder, "bin").toLowerCase());
    // What was there is still there, and the kind of value has not changed.
    expect(after?.kind).toBe(before?.kind ?? "REG_EXPAND_SZ");
    for (const entry of folders(before?.value ?? "")) {
      if (entry) expect(folders(after?.value ?? "")).toContain(entry);
    }

    // The command prints its version and help in the terminal.
    const command = path.join(folder, "bin", "arden-code.exe");
    const version = spawnSync(command, ["--version"], { encoding: "utf8" });
    expect(version.stdout).toMatch(/^arden-code \d+\.\d+\.\d+/u);
    expect(spawnSync(command, ["--help"], { encoding: "utf8" }).stdout).toContain("USAGE");
    const missing = spawnSync(command, [path.join(folder, "no-such-folder")], { encoding: "utf8" });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("does not exist");
  });

  test("uninstalls, takes the command off the PATH, and leaves the PATH as it was", async () => {
    const folder = install();
    expect(folders(userPath()?.value ?? "")).toContain(path.join(folder, "bin").toLowerCase());

    spawnSync(path.join(folder, "uninstall.exe"), ["/S"]);
    await untilGone(folder);

    // The same folders in the same order. A semicolon at the end of the list means nothing, and the
    // installer does not put one back when the list had one.
    const withoutEmpty = (list: string | undefined) => folders(list ?? "").filter(Boolean);
    expect(withoutEmpty(userPath()?.value)).toEqual(withoutEmpty(before?.value));
    expect(userPath()?.kind).toBe(before?.kind);
    installed = undefined;
  });

  test("leaves the PATH alone when it is asked to with /NOPATH", () => {
    const folder = install("/NOPATH");

    expect(existsSync(path.join(folder, "bin", "arden-code.exe"))).toBe(true);
    expect(userPath()?.value).toBe(before?.value);
  });
});
