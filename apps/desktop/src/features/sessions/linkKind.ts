/**
 * What may be done with a link in an agent's reply. These are the rules of `arden_core::links` in
 * Rust, which decides again when a link is opened; `link-cases.json` holds the cases both are
 * tested against.
 */
export type LinkKind = "open" | "confirm" | "blocked";

const MAX_LENGTH = 2048;

const blockedSchemes = new Set([
  "javascript",
  "vbscript",
  "data",
  "blob",
  "about",
  "view-source",
  "ms-msdt",
  "ms-officecmd",
  "ms-appinstaller",
  "search-ms",
  "search",
]);

const programExtensions = new Set([
  "exe",
  "com",
  "bat",
  "cmd",
  "scr",
  "pif",
  "msi",
  "msp",
  "msix",
  "appx",
  "application",
  "gadget",
  "ps1",
  "psm1",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "hta",
  "lnk",
  "url",
  "reg",
  "inf",
  "cpl",
  "dll",
  "jar",
]);

function webAddress(rest: string): LinkKind {
  if (!rest.startsWith("//")) return "blocked";
  const authority = rest.slice(2).split(/[/?#]/u)[0] ?? "";
  const host = authority.split("@").at(-1) ?? "";
  return host === "" || host.startsWith(":") ? "blocked" : "open";
}

function fileLink(rest: string): LinkKind {
  if (!rest.startsWith("//")) return "blocked";
  const after = rest.slice(2);
  const slash = after.indexOf("/");
  const host = slash === -1 ? after : after.slice(0, slash);
  const path = slash === -1 ? "" : after.slice(slash + 1);
  if (host !== "" && host.toLowerCase() !== "localhost") return "blocked";
  const name = (path.split(/[?#]/u)[0] ?? "").split(/[/\\]/u).at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  const extension =
    dot === -1
      ? undefined
      : name
          .slice(dot + 1)
          .trimEnd()
          .toLowerCase();
  return extension !== undefined && programExtensions.has(extension) ? "blocked" : "confirm";
}

/** Whether the text holds a control character, which no link a person wrote has. */
function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** The kind of link, decided from its text alone. */
export function classifyLink(link: string): LinkKind {
  const text = link.trim();
  if (text === "" || text.length > MAX_LENGTH || hasControlCharacter(text)) return "blocked";
  const colon = text.indexOf(":");
  if (colon === -1) return "blocked";
  const scheme = text.slice(0, colon);
  if (!/^[a-z][a-z0-9+.-]*$/iu.test(scheme)) return "blocked";
  const lower = scheme.toLowerCase();
  if (blockedSchemes.has(lower)) return "blocked";
  const rest = text.slice(colon + 1);
  if (lower === "http" || lower === "https") return webAddress(rest);
  if (lower === "file") return fileLink(rest);
  return "confirm";
}
