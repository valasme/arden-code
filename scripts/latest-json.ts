// Makes the update manifest (latest.json) that the app looks for, from the installer's signature.
//
//   node scripts/latest-json.ts --version 1.2.3 --url https://.../setup.exe --signature-file setup.exe.sig
//     [--platform windows-x86_64[,another-name]] [--merge other-latest.json[,another.json]]
//     [--trusted-key <plugins.updater.pubkey from tauri.conf.json>]
//
// With --trusted-key it refuses a signature made with any other key: the app would refuse that update.
// --platform names the platforms the file is for (several names may share one file, as the AppImage
// is also what a Linux copy installed some other way finds). --merge adds the platforms of manifests
// that other builds made for the same version, so one latest.json lists Windows and Linux (ADR 0062).
//
// The manifest holds only what the updater needs: the version, when it was published, notes, and for
// each platform where to download the installer and its signature. The app checks the signature
// against its own key before it trusts anything, so this file cannot make the app install anything
// that was not signed with the private key.

import { readFileSync } from "node:fs";

export interface PlatformEntry {
  /** Where the installer can be downloaded. */
  url: string;
  /** The contents of the `.sig` file the Tauri signer made for the installer. */
  signature: string;
}

export interface Manifest {
  version: string;
  notes: string;
  /** When the release was published, as an RFC 3339 time. */
  publishedAt: string;
  /** Keyed like `windows-x86_64`. */
  platforms: Record<string, PlatformEntry>;
}

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const platformName = /^(?:windows|linux|darwin)-(?:x86_64|aarch64|i686|armv7)(?:-[a-z]+)?$/u;

/** The manifest as the text of `latest.json`. Refuses anything the updater could not use safely. */
export function buildLatestJson(manifest: Manifest): string {
  if (!semver.test(manifest.version)) throw new Error(`"${manifest.version}" is not a version`);
  if (Number.isNaN(Date.parse(manifest.publishedAt))) {
    throw new Error(`"${manifest.publishedAt}" is not a time`);
  }
  const entries = Object.entries(manifest.platforms);
  if (entries.length === 0) throw new Error("the manifest lists no platform");
  for (const [name, entry] of entries) {
    if (!platformName.test(name)) throw new Error(`"${name}" is not a platform`);
    if (!entry.url.startsWith("https://")) throw new Error(`the address for ${name} is not https`);
    if (entry.signature.trim() === "") throw new Error(`the signature for ${name} is empty`);
  }
  return `${JSON.stringify(
    {
      version: manifest.version,
      notes: manifest.notes,
      pub_date: new Date(manifest.publishedAt).toISOString(),
      platforms: Object.fromEntries(
        entries.map(([name, entry]) => [
          name,
          { signature: entry.signature.trim(), url: entry.url },
        ]),
      ),
    },
    null,
    2,
  )}\n`;
}

/**
 * The id of the key in a Tauri public key or signature, as minisign writes it (`2DC1D186A8270EF5`).
 * Both are base64 of minisign's text, whose second line is base64 of the algorithm (2 bytes), the key
 * id (8 bytes, little-endian) and the key or signature itself.
 */
export function minisignKeyId(value: string): string {
  const line = Buffer.from(value.trim(), "base64").toString("utf8").split("\n")[1]?.trim() ?? "";
  const bytes = Buffer.from(line, "base64");
  if (bytes.length < 10) throw new Error("this is not a minisign key or signature");
  return Buffer.from(bytes.subarray(2, 10).toReversed()).toString("hex").toUpperCase();
}

/**
 * Refuses a signature made with any key but the one the app trusts (`plugins.updater.pubkey` in
 * `tauri.conf.json`): every installed copy would refuse that update.
 */
export function checkSignedWith(signature: string, trustedKey: string): void {
  const signedWith = minisignKeyId(signature);
  const trusted = minisignKeyId(trustedKey);
  if (signedWith !== trusted) {
    throw new Error(
      `the installer was signed with key ${signedWith}, but the app trusts key ${trusted}: the TAURI_SIGNING_PRIVATE_KEY secret is not the key in tauri.conf.json`,
    );
  }
}

/** The platforms a `latest.json` lists, refusing one made for another version. */
export function platformsOf(latestJson: string, version: string): Record<string, PlatformEntry> {
  const parsed: unknown = JSON.parse(latestJson);
  if (typeof parsed !== "object" || parsed === null) throw new Error("not an update manifest");
  const listed: unknown = Reflect.get(parsed, "version");
  if (listed !== version) {
    throw new Error(`a manifest for version ${String(listed)} cannot join one for ${version}`);
  }
  const platforms: unknown = Reflect.get(parsed, "platforms");
  if (typeof platforms !== "object" || platforms === null) throw new Error("it lists no platform");
  return Object.fromEntries(
    Object.entries(platforms).map(([name, entry]: [string, unknown]) => {
      const url: unknown = typeof entry === "object" && entry ? Reflect.get(entry, "url") : null;
      const signature: unknown =
        typeof entry === "object" && entry ? Reflect.get(entry, "signature") : null;
      if (typeof url !== "string" || typeof signature !== "string") {
        throw new Error(`the entry for ${name} is not an address and a signature`);
      }
      return [name, { url, signature }];
    }),
  );
}

/** Adds `more` platforms to `platforms`, refusing a platform listed twice. */
export function joinPlatforms(
  platforms: Record<string, PlatformEntry>,
  more: Record<string, PlatformEntry>,
): Record<string, PlatformEntry> {
  for (const name of Object.keys(more)) {
    if (name in platforms) throw new Error(`${name} is listed twice`);
  }
  return { ...platforms, ...more };
}

/** A comma-separated list, without empty items. */
export function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/** The value after each `--name` in a list of arguments. */
export function parseArguments(argv: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name === undefined || !name.startsWith("--") || value === undefined) {
      throw new Error(`expected --name value pairs, got "${name ?? ""}"`);
    }
    values[name.slice(2)] = value;
  }
  return values;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const need = (name: string): string => {
    const value = options[name];
    if (value === undefined) throw new Error(`--${name} is missing`);
    return value;
  };
  const version = need("version");
  const signature = readFileSync(need("signature-file"), "utf8");
  const trustedKey = options["trusted-key"];
  if (trustedKey !== undefined) checkSignedWith(signature, trustedKey);
  const names = list(options["platform"]);
  let platforms: Record<string, PlatformEntry> = Object.fromEntries(
    (names.length > 0 ? names : ["windows-x86_64"]).map((name) => [
      name,
      { url: need("url"), signature },
    ]),
  );
  for (const file of list(options["merge"])) {
    const more = platformsOf(readFileSync(file, "utf8"), version);
    if (trustedKey !== undefined) {
      for (const entry of Object.values(more)) checkSignedWith(entry.signature, trustedKey);
    }
    platforms = joinPlatforms(platforms, more);
  }
  process.stdout.write(
    buildLatestJson({
      version,
      notes: options["notes"] ?? "",
      publishedAt: options["published-at"] ?? new Date().toISOString(),
      platforms,
    }),
  );
}

if (import.meta.main) main();
