/**
 * The word under the cursor that the message box's list opens at (ADR 0052): a word that starts
 * with a slash at the start of the message or after a space or line break.
 */
export interface CursorWord {
  sign: "/";
  /** What is typed after the sign, up to the cursor. */
  query: string;
  /** Where the word starts, at its sign. */
  start: number;
  /** Where the word ends: filling in replaces the text from `start` to here. */
  end: number;
  /** Whether nothing but spaces comes before it, so it is the message's first word. */
  first: boolean;
}

/** The word the cursor is in, or ends, when it starts with a slash; else null. */
export function wordAt(text: string, cursor: number): CursorWord | null {
  const before = text.slice(0, cursor);
  const start = before.search(/\S*$/);
  if (text[start] !== "/" || start >= cursor) return null;
  const after = /^\S*/.exec(text.slice(cursor))?.[0] ?? "";
  return {
    sign: "/",
    query: text.slice(start + 1, cursor),
    start,
    end: cursor + after.length,
    first: text.slice(0, start).trim() === "",
  };
}
