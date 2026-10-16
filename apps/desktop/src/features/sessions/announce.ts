/** How often a screen reader is given more of a reply that is still streaming. */
export const ANNOUNCE_INTERVAL_MS = 3000;

/** Markdown as it reads aloud: without the marks that only draw it. */
export function readable(markdown: string): string {
  return (
    markdown
      // A link reads as its words, not its address.
      .replaceAll(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
      .replaceAll(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gmu, "")
      .replaceAll(/[*_`|]/gu, "")
      .replaceAll(/\s+/gu, " ")
      .trim()
  );
}

/**
 * Cuts the text at the last place a fenced code block is still open: what is in it would be read
 * out letter by letter, and is on the screen for anyone who wants it.
 */
function beforeOpenFence(text: string): string {
  const fences = [...text.matchAll(/^\s{0,3}```/gmu)];
  const last = fences.at(-1);
  return fences.length % 2 === 1 && last?.index !== undefined ? text.slice(0, last.index) : text;
}

/** Where the last complete sentence in the text ends, or 0 when there is none. */
function endOfLastSentence(text: string): number {
  let end = 0;
  for (const match of text.matchAll(/[.!?…](?=\s|$)|\n\n/gu)) {
    end = match.index + match[0].length;
  }
  return end;
}

/**
 * What to say next about a reply that is still streaming: the complete sentences since the last
 * time, and where they end. Half a sentence waits for the rest of it, so the screen reader reads
 * whole thoughts, and only the text the person has not heard yet.
 */
export function nextAnnouncement(text: string, spoken: number): { say: string; spoken: number } {
  const unheard = beforeOpenFence(text).slice(spoken);
  const end = endOfLastSentence(unheard);
  if (end === 0) return { say: "", spoken };
  return { say: readable(unheard.slice(0, end)), spoken: spoken + end };
}

/** What remains to say when the reply is over, including a last sentence with no full stop. */
export function finalAnnouncement(text: string, spoken: number): string {
  return readable(beforeOpenFence(text).slice(spoken));
}
