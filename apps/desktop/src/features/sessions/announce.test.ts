import { finalAnnouncement, nextAnnouncement, readable } from "./announce";

describe("What a screen reader is told about a streaming reply", () => {
  it("waits for a whole sentence, and says nothing for half of one", () => {
    expect(nextAnnouncement("This is the start of a sen", 0)).toEqual({ say: "", spoken: 0 });
  });

  it("says the complete sentences, and keeps the half sentence for later", () => {
    const text = "First sentence. Second one! And a third that is not fini";

    const first = nextAnnouncement(text, 0);

    expect(first.say).toBe("First sentence. Second one!");
    const later = nextAnnouncement(`${text}shed. Next`, first.spoken);
    expect(later.say).toBe("And a third that is not finished.");
  });

  it("never repeats what was already said", () => {
    const text = "One. Two.";
    const first = nextAnnouncement(text, 0);

    expect(nextAnnouncement(text, first.spoken)).toEqual({ say: "", spoken: first.spoken });
  });

  it("reads a paragraph break as the end of a thought", () => {
    expect(nextAnnouncement("A heading without a stop\n\nThen text", 0).say).toBe(
      "A heading without a stop",
    );
  });

  it("does not read a code block that is still open, and reads the words before it", () => {
    const text = "Here is the code.\n\n```ts\nconst answer = 4";

    expect(nextAnnouncement(text, 0).say).toBe("Here is the code.");
  });

  it("does not read the marks of Markdown or the address of a link", () => {
    const text = "## A **bold** move with [a link](https://example.com/secret) and `code`.";

    expect(nextAnnouncement(text, 0).say).toBe("A bold move with a link and code.");
  });

  it("says what remains when the reply is over, even without a last full stop", () => {
    const text = "One. Two and a half";
    const first = nextAnnouncement(text, 0);

    expect(finalAnnouncement(text, first.spoken)).toBe("Two and a half");
    expect(finalAnnouncement("One.", 4)).toBe("");
  });

  it("reads list items and quotes as plain words", () => {
    expect(readable("- one\n- two\n\n> quoted")).toBe("one two quoted");
  });
});
