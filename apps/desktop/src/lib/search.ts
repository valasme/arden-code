/** Lower case, without accents, so "Café" and "cafe" are the same text. */
function plain(text: string): string {
  return text
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Whether a name or its description (a setting, a package, a session) contains every word typed. */
export function matchesSearch(
  setting: { label: string; description: string },
  query: string,
): boolean {
  const words = plain(query).split(/\s+/u).filter(Boolean);
  const text = plain(`${setting.label} ${setting.description}`);
  return words.every((word) => text.includes(word));
}
