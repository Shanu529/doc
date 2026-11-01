import { embed } from "./ai";
/** Retrieves only the chunks needed for a question. `sb` is the user's RLS-scoped client, so other users' data is unreachable. */
export async function retrieve(sb: any, q: string, ids?: string[], n = 10) {
  let rows: any[] = [];
  try { const e = await embed([q]); if (e) rows = (await sb.rpc("match_chunks", { query_embedding: JSON.stringify(e[0]), match_count: n * 2 })).data ?? []; } catch {}
  const words = [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])].slice(0, 8);
  if (words.length) rows.push(...((await sb.from("document_chunks").select("document_id,page,content").textSearch("content", words.join(" or "), { config: "simple", type: "websearch" }).limit(n)).data ?? []));
  if (ids?.length) { rows = rows.filter((r) => ids.includes(r.document_id)); if (!rows.length) rows = (await sb.from("document_chunks").select("document_id,page,content").in("document_id", ids).order("page").limit(n)).data ?? []; }
  const seen = new Set<string>(); rows = rows.filter((r) => { const k = r.document_id + r.page + r.content.slice(0, 40); return seen.has(k) ? false : (seen.add(k), true); });
  const { data: docs } = await sb.from("documents").select("id,title").in("id", [...new Set(rows.map((r) => r.document_id))]).is("deleted_at", null);
  const title = new Map<string, string>((docs ?? []).map((d: any) => [d.id, d.title]));
  return rows.filter((r) => title.has(r.document_id)).slice(0, n).map((r) => ({ ...r, title: title.get(r.document_id)! }));
}
