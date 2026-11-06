/**
 * The six colours people have on a page: the one place 2a allows hue beyond
 * moss, because telling two cursors apart is the point. Even lightness, so
 * no colleague shouts louder than another. Hex because the cursor library
 * accepts nothing else; the ink on them is --presence-ink, in both themes.
 */
const PRESENCE = ["#9fd4a9", "#e8b98b", "#9cc3ea", "#e0a8d6", "#cfcf8b", "#eda8a6"];

/** A person's own colour on the page, stable across sessions. */
export function presenceColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PRESENCE[Math.abs(hash) % PRESENCE.length]!;
}
