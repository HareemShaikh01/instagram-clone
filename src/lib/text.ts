const HASHTAG_RE = /#([\p{L}\p{N}_]{1,64})/gu;
const MENTION_RE = /@([a-zA-Z0-9._]{3,30})/g;

export function extractHashtags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(HASHTAG_RE)) {
    const tag = m[1].toLowerCase();
    if (/^[\p{L}\p{N}_]+$/u.test(tag)) out.add(tag);
  }
  return [...out];
}

export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) out.add(m[1].toLowerCase());
  return [...out];
}

/** Split caption into segments for rich rendering (text | hashtag | mention). */
export function tokenizeRichText(
  text: string,
): Array<{ type: "text" | "hashtag" | "mention"; value: string }> {
  const re = /(#([\p{L}\p{N}_]{1,64})|@([a-zA-Z0-9._]{3,30}))/gu;
  const segments: Array<{ type: "text" | "hashtag" | "mention"; value: string }> = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ type: "text", value: text.slice(last, idx) });
    if (m[0].startsWith("#")) segments.push({ type: "hashtag", value: m[2] ?? "" });
    else segments.push({ type: "mention", value: m[3] ?? "" });
    last = idx + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}
