import { wordAt } from "./cursorWord";

/** The word under the cursor, the cursor written as `|` in the text. */
const at = (marked: string) => {
  const cursor = marked.indexOf("|");
  return wordAt(marked.replace("|", ""), cursor);
};

describe("wordAt", () => {
  it("is the message's first word while the cursor ends it", () => {
    expect(at("/comp|")).toEqual({ sign: "/", query: "comp", start: 0, end: 5, first: true });
    expect(at("/|")).toEqual({ sign: "/", query: "", start: 0, end: 1, first: true });
  });

  it("is a later word, after a space or a line break", () => {
    expect(at("/tdd /gri|")).toEqual({ sign: "/", query: "gri", start: 5, end: 9, first: false });
    expect(at("fix this with /gri|")).toMatchObject({ query: "gri", start: 14, first: false });
    expect(at("hello\n/gri|")).toMatchObject({ query: "gri", start: 6, first: false });
  });

  it("counts a word after spaces alone as the first word, since the message is sent trimmed", () => {
    expect(at("  /comp|")).toMatchObject({ query: "comp", start: 2, first: true });
  });

  it("follows the cursor back into an earlier word, matching what comes before the cursor", () => {
    expect(at("/comp| /tdd")).toMatchObject({ query: "comp", start: 0, end: 5, first: true });
    expect(at("/co|mp /tdd")).toMatchObject({ query: "co", start: 0, end: 5 });
    expect(at("/tdd /gr|ill now")).toMatchObject({ query: "gr", start: 5, end: 11, first: false });
  });

  it("is nothing when the cursor is before the slash, or in a word that does not start with one", () => {
    expect(at("|/comp")).toBeNull();
    expect(at("hello|")).toBeNull();
    expect(at("/compact now|")).toBeNull();
    expect(at("/compact |")).toBeNull();
    expect(at("")).toBeNull();
  });

  it("is nothing for a slash inside a word, such as a path", () => {
    expect(at("src/comp|")).toBeNull();
    expect(at("a/|")).toBeNull();
  });
});

describe("wordAt, for file mentions (ADR 0052)", () => {
  it("is a word that starts with @, as the first word or a later one", () => {
    expect(at("@glos|")).toEqual({ sign: "@", query: "glos", start: 0, end: 5, first: true });
    expect(at("Read @src/ma|")).toEqual({
      sign: "@",
      query: "src/ma",
      start: 5,
      end: 12,
      first: false,
    });
    expect(at("Read @|")).toMatchObject({ sign: "@", query: "" });
  });

  it("is nothing for an @ inside a word, such as an email address", () => {
    expect(at("Write to ada@example.com|")).toBeNull();
    expect(at("ada@|")).toBeNull();
  });
});
