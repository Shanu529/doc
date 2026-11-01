import "regenerator-runtime/runtime"; // @pdf-lib/fontkit needs it to shape Indic scripts
import { PDFDocument, rgb, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "fs/promises";
import path from "path";
export type Entry = { date: string; type: string; title: string; confirmed: boolean };
const dir = path.join(process.cwd(), "assets", "fonts");
// Noto Sans (Latin, Greek, Cyrillic) with Noto Sans Devanagari as per-character fallback. Other scripts become "?" and the PDF says so.
const FILES = { reg: ["NotoSans-Regular.ttf", "NotoSansDevanagari-Regular.ttf"], bold: ["NotoSans-Bold.ttf", "NotoSansDevanagari-Regular.ttf"] };
type F = { f: PDFFont; set: Set<number> };
export async function buildPdfWithStats(o: { title: string; entries: Entry[]; body: string }) {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const load = async (names: string[]): Promise<F[]> => Promise.all(names.map(async (n) => { const f = await pdf.embedFont(await readFile(path.join(dir, n)), { subset: true }); return { f, set: new Set<number>(f.getCharacterSet()) }; }));
  const reg = await load(FILES.reg), bold = await load(FILES.bold); let unsupported = 0;
  const runs = (t: string, fonts: F[]) => { const out: { text: string; f: PDFFont }[] = [];
    for (const ch of t) { const cp = ch.codePointAt(0)!; let m = fonts.find((x) => x.set.has(cp)); let c = ch; if (!m) { m = fonts[0]; c = "?"; unsupported++; } const last = out[out.length - 1]; if (last && last.f === m.f) last.text += c; else out.push({ text: c, f: m.f }); }
    return out; };
  const width = (t: string, fonts: F[], size: number) => runs(t, fonts).reduce((w, r) => w + r.f.widthOfTextAtSize(r.text, size), 0);
  const wrap = (t: string, fonts: F[], size: number) => { const lines: string[] = [];
    for (const para of t.split("\n")) { let cur = ""; for (const word of para.split(" ")) { const next = cur ? `${cur} ${word}` : word; if (cur && width(next, fonts, size) > 495) { lines.push(cur); cur = word; } else cur = next; } lines.push(cur); } return lines; };
  let page = pdf.addPage([595, 842]); let y = 800;
  const put = (t: string, fonts: F[], size: number) => { for (const l of wrap(t, fonts, size)) { if (y < 60) { page = pdf.addPage([595, 842]); y = 800; } let x = 50;
    for (const r of runs(l, fonts)) { page.drawText(r.text, { x, y, size, font: r.f, color: rgb(0.1, 0.12, 0.18) }); x += r.f.widthOfTextAtSize(r.text, size); } y -= size + 5; } };
  put(o.title, bold, 18); y -= 4;
  put(`Generated ${new Date().toISOString().slice(0, 10)}. Informational summary prepared from the person's own uploaded records. It is not a diagnosis or medical advice.`, reg, 9); y -= 10;
  put("Records included", bold, 12);
  for (const e of o.entries) put(`${e.date} | ${e.type.replace(/_/g, " ")} | ${e.title} | ${e.confirmed ? "confirmed by owner" : "extracted, not verified"}`, reg, 9);
  y -= 10; put("AI-generated summary (check against the original documents)", bold, 12); put(o.body, reg, 10);
  const before = unsupported;
  if (before > 0) { y -= 10; put("Note: some characters use a script this PDF export cannot display and were replaced with ?. Refer to the original documents.", reg, 9); }
  return { bytes: await pdf.save(), unsupported: before };
}
export const buildPdf = async (o: { title: string; entries: Entry[]; body: string }) => (await buildPdfWithStats(o)).bytes;
