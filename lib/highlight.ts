export type Segment =
  | { type: "text"; text: string }
  | { type: "word"; surface: string; wordId: number };

const MARKER = /\[\[([^\[\]|]+?)\s*\|\s*(\d+)\]\]/g;

/**
 * Split tutor text into plain and highlighted segments. The tutor marks a
 * target word or expression as `[[surface form|word_id]]`.
 *
 * While streaming, a marker may be cut off mid-way ("...a [[ephem"); with
 * `streaming: true` that unfinished tail is held back so raw brackets never
 * flash on screen.
 */
export function parseSegments(text: string, opts: { streaming?: boolean } = {}): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const m of text.matchAll(MARKER)) {
    const start = m.index!;
    if (start > cursor) segments.push({ type: "text", text: text.slice(cursor, start) });
    segments.push({ type: "word", surface: m[1].trim(), wordId: Number(m[2]) });
    cursor = start + m[0].length;
  }
  let tail = text.slice(cursor);
  if (opts.streaming) {
    const open = tail.lastIndexOf("[[");
    if (open !== -1) tail = tail.slice(0, open);
    else if (tail.endsWith("[")) tail = tail.slice(0, -1);
  }
  if (tail) segments.push({ type: "text", text: tail });
  return segments;
}

/** Word ids that appear as markers in the text. */
export function markedWordIds(text: string): number[] {
  return [...text.matchAll(MARKER)].map((m) => Number(m[2]));
}

/** Text with markers replaced by their surface forms. */
export function stripMarkers(text: string): string {
  return text.replace(MARKER, (_, surface: string) => surface.trim());
}

/** The sentence in `text` containing the marker for `wordId`, markers stripped. */
export function contextSentence(text: string, wordId: number): string {
  const marker = new RegExp(`\\[\\[[^\\[\\]|]+?\\s*\\|\\s*${wordId}\\]\\]`);
  const m = marker.exec(text);
  if (!m) return "";
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  const startIdx = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("! "),
    before.lastIndexOf("? "),
    before.lastIndexOf("\n"),
  );
  const endMatch = /[.!?](\s|$)|\n/.exec(after);
  const endIdx = endMatch ? endMatch.index + 1 : after.length;
  const sentence = before.slice(startIdx + 1) + m[0] + after.slice(0, endIdx);
  return stripMarkers(sentence).trim();
}
