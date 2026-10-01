import {
  buildLatestJson,
  checkSignedWith,
  minisignKeyId,
  parseArguments,
  type Manifest,
} from "../../../../scripts/latest-json";

const manifest: Manifest = {
  version: "1.2.3",
  notes: "What is new",
  publishedAt: "2026-09-30T12:00:00Z",
  platforms: {
    "windows-x86_64": {
      url: "https://github.com/valasme/arden-code/releases/download/v1.2.3/Arden.Code_1.2.3_x64-setup.exe",
      signature: "  dW50cnVzdGVk...  \n",
    },
  },
};

describe("The update manifest", () => {
  it("has the shape the updater reads, and nothing more", () => {
    const text = buildLatestJson(manifest);

    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text)).toEqual({
      version: "1.2.3",
      notes: "What is new",
      pub_date: "2026-09-30T12:00:00.000Z",
      platforms: {
        "windows-x86_64": {
          signature: "dW50cnVzdGVk...",
          url: "https://github.com/valasme/arden-code/releases/download/v1.2.3/Arden.Code_1.2.3_x64-setup.exe",
        },
      },
    });
  });

  it.each(["1.2", "v1.2.3", "one", "", "1.2.3.4"])("refuses %j as a version", (version) => {
    expect(() => buildLatestJson({ ...manifest, version })).toThrow(/not a version/u);
  });

  it("accepts a pre-release version", () => {
    expect(() => buildLatestJson({ ...manifest, version: "1.2.3-beta.1" })).not.toThrow();
  });

  it("refuses an address that is not https, since the download must be private and untampered", () => {
    const platforms = {
      "windows-x86_64": { url: "http://example.com/setup.exe", signature: "sig" },
    };

    expect(() => buildLatestJson({ ...manifest, platforms })).toThrow(/not https/u);
  });

  it("refuses an empty signature, and a manifest with no platform or an unknown one", () => {
    const url = "https://example.com/setup.exe";

    expect(() =>
      buildLatestJson({ ...manifest, platforms: { "windows-x86_64": { url, signature: " \n" } } }),
    ).toThrow(/empty/u);
    expect(() => buildLatestJson({ ...manifest, platforms: {} })).toThrow(/no platform/u);
    expect(() =>
      buildLatestJson({ ...manifest, platforms: { "amiga-m68k": { url, signature: "sig" } } }),
    ).toThrow(/not a platform/u);
  });

  it("refuses a time that is not a time", () => {
    expect(() => buildLatestJson({ ...manifest, publishedAt: "yesterday-ish" })).toThrow(
      /not a time/u,
    );
  });

  it("reads --name value pairs from the command line, and refuses anything else", () => {
    expect(parseArguments(["--version", "1.0.0", "--url", "https://x"])).toEqual({
      version: "1.0.0",
      url: "https://x",
    });
    expect(() => parseArguments(["version", "1.0.0"])).toThrow(/expected/u);
    expect(() => parseArguments(["--version"])).toThrow(/expected/u);
  });
});

/**
 * A key or signature as Tauri writes it: base64 of minisign's text, whose second line is base64 of
 * the algorithm (2 bytes), the key id (8 bytes, little-endian) and the key or signature itself.
 */
function minisign(comment: string, algorithm: string, keyId: string, rest: number): string {
  const id = Buffer.from(keyId, "hex").toReversed();
  const payload = Buffer.concat([Buffer.from(algorithm), id, Buffer.alloc(rest, 7)]);
  return Buffer.from(`untrusted comment: ${comment}\n${payload.toString("base64")}\n`).toString(
    "base64",
  );
}

const publicKey = (keyId: string) => minisign(`minisign public key: ${keyId}`, "Ed", keyId, 32);
const signature = (keyId: string) => minisign("signature from tauri secret key", "ED", keyId, 64);

describe("The key an installer was signed with", () => {
  it("is read from a public key and from a signature, as minisign names it", () => {
    expect(minisignKeyId(publicKey("2DC1D186A8270EF5"))).toBe("2DC1D186A8270EF5");
    expect(minisignKeyId(signature("2DC1D186A8270EF5"))).toBe("2DC1D186A8270EF5");
  });

  it("must be the key the app trusts, or every installed copy would refuse the update", () => {
    expect(() => {
      checkSignedWith(signature("2DC1D186A8270EF5"), publicKey("2DC1D186A8270EF5"));
    }).not.toThrow();
    expect(() => {
      checkSignedWith(signature("050BF62F82230125"), publicKey("2DC1D186A8270EF5"));
    }).toThrow(/signed with key 050BF62F82230125, but the app trusts key 2DC1D186A8270EF5/u);
  });

  it("refuses text that is not a key or a signature", () => {
    expect(() => minisignKeyId("not base64 of anything")).toThrow(/not a minisign/u);
    expect(() => minisignKeyId("")).toThrow(/not a minisign/u);
  });
});
