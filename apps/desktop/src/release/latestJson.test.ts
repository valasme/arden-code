import { buildLatestJson, parseArguments, type Manifest } from "../../../../scripts/latest-json";

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
