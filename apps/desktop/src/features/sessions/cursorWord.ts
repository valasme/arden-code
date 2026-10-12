/**
 * The word under the cursor that the message box's list opens at (ADR 0052): a word that starts
 * with a slash (a slash command) or an `@` (a file mention), at the start of the message or after a
 * space or line break.
 */
export interface CursorWord {
  sign: "/" | "@";
  /** What is typed after the sign, up to the cursor. */
  query: string;
  /** Where the word starts, at its sign. */
  start: number;
  /** Where the word ends: filling in replaces the text from `start` to here. */
  end: number;
  /** Whether nothing but spaces comes before it, so it is the message's first word. */
  first: boolean;
}

/**
 * The quoted file mention the cursor is in, or ends: `@"` at the start of a word, up to its
 * closing quote, or to the end of the line while there is none yet. Its query is what is typed
 * inside the quotes, up to the cursor.
 */
function quotedWordAt(text: string, cursor: number): CursorWord | null {
  const start = text.slice(0, cursor).lastIndexOf('@"');
  if (start < 0 || (start > 0 && !/\s/.test(text.charAt(start - 1)))) return null;
  const lineEnd = text.indexOf("\n", start);
  const lineStop = lineEnd < 0 ? text.length : lineEnd;
  const close = text.indexOf('"', start + 2);
  const closed = close >= 0 && close < lineStop;
  const end = closed ? close + 1 : lineStop;
  if (cursor > end) return null;
  return {
    sign: "@",
    query: text.slice(start + 2, closed ? Math.min(cursor, close) : cursor),
    start,
    end,
    first: text.slice(0, start).trim() === "",
  };
}

/** The word the cursor is in, or ends, when it starts with a slash or an `@`; else null. */
export function wordAt(text: string, cursor: number): CursorWord | null {
  const quoted = quotedWordAt(text, cursor);
  if (quoted) return quoted;
  const before = text.slice(0, cursor);
  const start = before.search(/\S*$/);
  const sign = text[start];
  if ((sign !== "/" && sign !== "@") || start >= cursor) return null;
  const after = /^\S*/.exec(text.slice(cursor))?.[0] ?? "";
  return {
    sign,
    query: text.slice(start + 1, cursor),
    start,
    end: cursor + after.length,
    first: text.slice(0, start).trim() === "",
  };
}
