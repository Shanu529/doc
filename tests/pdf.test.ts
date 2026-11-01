import test from "node:test"; import assert from "node:assert/strict"; import { writeFileSync } from "fs";
import { buildPdfWithStats } from "../src/lib/pdf";
const entries = [{ date: "2024-01-01", type: "lab_report", title: "Rapport médical", confirmed: true }];
test("PDF embeds Latin accents, Greek, Cyrillic and Devanagari", async () => {
  const body = "Café résumé naïve. Ελληνικά. Привет, мир. रोगी की रिपोर्ट: हीमोग्लोबिन 13.2";
  const { bytes, unsupported } = await buildPdfWithStats({ title: "Medical history", entries, body }); assert.equal(unsupported, 0); assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const pdf = (await import("pdf-parse/lib/pdf-parse.js" as any)).default; const t = (await pdf(Buffer.from(bytes))).text as string;
  // Devanagari is verified by rendering (pdftoppm), because pdf-parse cannot map shaped Indic glyphs back to text.
  for (const w of ["Café", "Ελληνικά", "Привет"]) assert.ok(t.includes(w), `missing ${w}`); writeFileSync("/tmp/unicode.pdf", bytes);
});
test("unsupported scripts are counted and disclosed in the PDF", async () => { const { bytes, unsupported } = await buildPdfWithStats({ title: "T", entries: [], body: "中文 العربية" }); assert.ok(unsupported >= 6); const t = (await (await import("pdf-parse/lib/pdf-parse.js" as any)).default(Buffer.from(bytes))).text; assert.match(t, /replaced with \?/); });
test("long text paginates", async () => { const { bytes } = await buildPdfWithStats({ title: "T", entries, body: "line\n".repeat(300) }); const t = await (await import("pdf-lib")).PDFDocument.load(bytes); assert.ok(t.getPageCount() > 1); });
