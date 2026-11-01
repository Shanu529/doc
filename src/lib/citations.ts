/** Mechanical grounding checks on a model answer. `sources` holds the text of source [1], [2], ... */
export function checkCitations(answer: string, sources: string[]) {
  const n = sources.length;
  const cited = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => +m[1]);
  const invalid = [...new Set(cited.filter((c) => c < 1 || c > n))];
  const facts = answer.split(/AI interpretation/i)[0];
  const bullets = facts.split("\n").filter((l) => /^\s*[-*•]/.test(l));
  const uncited = bullets.filter((l) => !/\[\d+\]/.test(l)).length;
  const norm = (s: string) => s.replace(/,/g, "");
  const unverifiedNumbers: string[] = [];
  for (const b of bullets) {
    const refs = [...b.matchAll(/\[(\d+)\]/g)].map((m) => +m[1]).filter((c) => c >= 1 && c <= n); if (!refs.length) continue;
    const text = norm(refs.map((r) => sources[r - 1]).join(" "));
    for (const num of norm(b.replace(/\[\d+\]/g, "").replace(/^\s*[-*•]\s*/, "")).match(/\d+(?:\.\d+)?/g) ?? []) if (!text.includes(num)) unverifiedNumbers.push(num);
  }
  const warnings: string[] = [];
  if (invalid.length) warnings.push("Some citations pointed to sources that were not provided; they were marked [?].");
  if (uncited) warnings.push(`${uncited} statement${uncited > 1 ? "s have" : " has"} no source citation. Treat as unverified.`);
  if (unverifiedNumbers.length) warnings.push(`These values were not found in the cited source text: ${[...new Set(unverifiedNumbers)].join(", ")}. Check the original document.`);
  return { cited: [...new Set(cited.filter((c) => c >= 1 && c <= n))], invalid, uncited, unverifiedNumbers, warnings,
    clean: invalid.reduce((a, i) => a.replaceAll(`[${i}]`, "[?]"), answer) };
}
