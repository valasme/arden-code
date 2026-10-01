// Makes the update manifest (latest.json) that the app looks for, from the installer's signature.
//
//   node scripts/latest-json.ts --version 1.2.3 --url https://.../setup.exe --signature-file setup.exe.sig
//     [--trusted-key <plugins.updater.pubkey from tauri.conf.json>]
//
// With --trusted-key it refuses a signature made with any other key: the app would refuse that update.
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
  const signature = readFileSync(need("signature-file"), "utf8");
  const trustedKey = options["trusted-key"];
  if (trustedKey !== undefined) checkSignedWith(signature, trustedKey);
  process.stdout.write(
    buildLatestJson({
      version: need("version"),
      notes: options["notes"] ?? "",
      publishedAt: options["published-at"] ?? new Date().toISOString(),
      platforms: {
        [options["platform"] ?? "windows-x86_64"]: {
          url: need("url"),
          signature,
        },
      },
    }),
  );
}

if (import.meta.main) main();
