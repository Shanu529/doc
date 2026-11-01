const RULES: [string, RegExp][] = [
 ["lab_report", /\b(hemoglobin|haemoglobin|cholesterol|reference range|blood test|laboratory|cbc|glucose)\b/gi],
 ["prescription", /\b(prescription|dosage|tablets?|capsules?|take \d|rx)\b/gi],
 ["discharge_summary", /discharge summary|date of discharge|admitted/gi],
 ["insurance", /\b(policy number|insured|premium|insurance|coverage)\b/gi],
 ["passport", /\b(passport|nationality|place of birth)\b/gi],
 ["certificate", /\b(certificate|degree|bachelor|master of|university|diploma)\b/gi],
 ["invoice", /\b(invoice|amount due|total due|tax|gst|vat)\b/gi],
 ["contract", /\b(agreement|employment|contract|hereinafter|employer)\b/gi]];
export function classify(text: string) {
  let best = { type: "other", hits: 0 };
  for (const [t, re] of RULES) { const h = (text.match(re) ?? []).length; if (h > best.hits) best = { type: t, hits: h }; }
  return { type: best.type, confidence: best.hits ? Math.min(0.9, 0.3 + 0.1 * best.hits) : 0 };
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
/** First plausible date in the text. Numeric dates are read day-first, so results stay "unverified" until the user confirms. */
export function extractDate(text: string): string | null {
  const t = text.slice(0, 4000); let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(19|20)(\d{2})-(\d{2})-(\d{2})\b/))) return iso(+(m[1] + m[2]), +m[3], +m[4]);
  if ((m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\w*\.?,?\s+((?:19|20)\d{2})\b/i))) return iso(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  if ((m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-]((?:19|20)\d{2})\b/))) return iso(+m[3], +m[2], +m[1]);
  return null;
}
export function chunkPages(pages: string[], size = 1200, cap = 400) {
  const chunks: { page: number; content: string }[] = []; let truncated = false;
  pages.forEach((p, i) => { for (let s = 0; s < p.length; s += size) { const c = p.slice(s, s + size).trim(); if (c.length < 10) continue; if (chunks.length >= cap) { truncated = true; return; } chunks.push({ page: i + 1, content: c }); } });
  return { chunks, truncated };
}
