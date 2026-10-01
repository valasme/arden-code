import cases from "../../../../../crates/arden-core/link-cases.json";

import { classifyLink } from "./linkKind";

describe("The kinds of link", () => {
  it("has the same rules as Rust: every case of the shared list comes out as written", () => {
    expect(cases.length).toBeGreaterThan(30);

    for (const { link, kind } of cases) {
      expect(classifyLink(link), link).toBe(kind);
    }
  });

  it("blocks a very long link", () => {
    expect(classifyLink(`https://example.com/${"a".repeat(2048)}`)).toBe("blocked");
  });
});
