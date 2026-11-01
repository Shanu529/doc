// Runs the real migrations on Postgres + pgvector and attacks them as two separate users. Needs DATABASE_URL (a throwaway database).
import test, { before, after } from "node:test"; import assert from "node:assert/strict"; import { readFileSync, readdirSync } from "fs"; import { Pool } from "pg";
const url = process.env.DATABASE_URL; const skip = !url;
const pool = new Pool({ connectionString: url }); const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const TABLES = ["folders", "documents", "extracted_document_data", "document_chunks", "ai_summaries", "processing_jobs", "share_links", "share_link_documents", "audit_events", "profiles", "deletion_requests"];
const vec = "(select array_fill(0.1::real, array[1536])::vector)";
async function as<T>(user: string | null, fn: (q: (sql: string, p?: any[]) => Promise<any>) => Promise<T>) {
  const c = await pool.connect();
  try { await c.query("begin"); await c.query(`set local role ${user ? "authenticated" : "anon"}`); if (user) await c.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    return await fn(async (s, p) => { await c.query("savepoint sp"); try { const r = await c.query(s, p); await c.query("release savepoint sp"); return r; } catch (e) { await c.query("rollback to savepoint sp"); throw e; } }); } finally { await c.query("rollback").catch(() => {}); c.release(); }
}
const denied = async (fn: () => Promise<any>) => { try { await fn(); return false; } catch (e: any) { return /row-level security|permission denied|immutable|violates/.test(String(e.message)); } };
before(async () => {
  if (skip) return; await pool.query(readFileSync("tests/db/bootstrap.sql", "utf8")); await pool.query("create extension if not exists vector");
  for (const f of readdirSync("supabase/migrations").sort()) await pool.query(readFileSync(`supabase/migrations/${f}`, "utf8"));
  for (const [u, k] of [[A, "a"], [B, "b"]]) {
    await pool.query("insert into auth.users(id,email) values ($1,$2)", [u, `${k}@x.test`]); await pool.query("insert into profiles(id) values ($1)", [u]); await pool.query("insert into deletion_requests(user_id) values ($1)", [u]);
    await pool.query("insert into folders(id,user_id,name) values (gen_random_uuid(),$1,$2)", [u, `folder-${k}`]);
    const d = (await pool.query("insert into documents(user_id,title,original_name,mime_type,size_bytes,storage_key) values ($1,$2,'f.pdf','application/pdf',1,$3) returning id", [u, `secret-${k}`, `key-${k}`])).rows[0].id;
    await pool.query("insert into extracted_document_data(document_id,user_id,full_text) values ($1,$2,$3)", [d, u, `secret text of ${k}`]);
    await pool.query(`insert into document_chunks(document_id,user_id,page,content,embedding) values ($1,$2,1,$3,${vec})`, [d, u, `secret chunk ${k}`]);
    const s = (await pool.query("insert into ai_summaries(user_id,document_ids,body) values ($1,$2,'s') returning id", [u, [d]])).rows[0].id;
    const l = (await pool.query("insert into share_links(user_id,token_hash,expires_at,summary_id) values ($1,$2,now()+interval '1 day',$3) returning id", [u, `hash-${k}`, s])).rows[0].id;
    await pool.query("insert into share_link_documents values ($1,$2)", [l, d]); await pool.query("insert into share_email_codes(link_id,code_hash,expires_at) values ($1,'h',now()+interval '1 day')", [l]);
    await pool.query("insert into audit_events(user_id,event,ref_id) values ($1,'share.access',$2)", [u, l]); await pool.query("insert into processing_jobs(document_id,user_id,kind) values ($1,$2,'extract')", [d, u]);
  }
});
after(async () => { await pool.end(); });

test("every public table has row-level security enabled", { skip }, async () => {
  const r = await pool.query("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"); assert.deepEqual(r.rows, []);
});
test("user A sees only own rows in every table; user B's are invisible", { skip }, async () => {
  for (const t of TABLES) { const own = t === "profiles" ? "id" : t === "share_link_documents" ? null : "user_id";
    await as(A, async (q) => { const all = (await q(`select count(*)::int n from ${t}`)).rows[0].n; assert.equal(all, 1, `${t}: A should see exactly 1 row`);
      if (own) assert.equal((await q(`select count(*)::int n from ${t} where ${own} = $1`, [B])).rows[0].n, 0, t); }); }
});
test("anonymous role sees nothing", { skip }, async () => { for (const t of [...TABLES, "share_email_codes", "rate_limits"]) await as(null, async (q) => { assert.equal((await q(`select count(*)::int n from ${t}`)).rows[0].n, 0, t); }); });
test("share email codes and rate limits are unreadable by users", { skip }, async () => { await as(A, async (q) => { assert.equal((await q("select count(*)::int n from share_email_codes")).rows[0].n, 0); assert.equal((await q("select count(*)::int n from rate_limits")).rows[0].n, 0); }); });
test("A cannot update or delete B's rows", { skip }, async () => {
  for (const [t, set] of [["documents", "title='x'"], ["folders", "name='x'"], ["ai_summaries", "body='x'"], ["share_links", "expires_at=now()"]]) await as(A, async (q) => {
    assert.equal((await q(`update ${t} set ${set} where user_id=$1`, [B])).rowCount, 0, `update ${t}`); assert.equal((await q(`delete from ${t} where user_id=$1`, [B])).rowCount, 0, `delete ${t}`); });
});
test("A cannot insert rows owned by B", { skip }, async () => { await as(A, async (q) => { assert.ok(await denied(() => q("insert into folders(user_id,name) values ($1,'x')", [B]))); }); });
test("A cannot link B's document into A's share link", { skip }, async () => {
  const bd = (await pool.query("select id from documents where user_id=$1", [B])).rows[0].id; const al = (await pool.query("select id from share_links where user_id=$1", [A])).rows[0].id;
  await as(A, async (q) => { assert.ok(await denied(() => q("insert into share_link_documents values ($1,$2)", [al, bd]))); });
});
test("A cannot create a share link or summary pointing at B's data", { skip }, async () => {
  const bs = (await pool.query("select id from ai_summaries where user_id=$1", [B])).rows[0].id; const bd = (await pool.query("select id from documents where user_id=$1", [B])).rows[0].id;
  await as(A, async (q) => { assert.ok(await denied(() => q("insert into share_links(user_id,token_hash,expires_at,summary_id) values ($1,'h2',now()+interval '1 hour',$2)", [A, bs])));
    assert.ok(await denied(() => q("insert into ai_summaries(user_id,document_ids,body) values ($1,$2,'x')", [A, [bd]]))); });
});
test("A cannot move own document into B's folder or point it at B's file", { skip }, async () => {
  const bf = (await pool.query("select id from folders where user_id=$1", [B])).rows[0].id;
  await as(A, async (q) => { assert.ok(await denied(() => q("update documents set folder_id=$1 where user_id=$2", [bf, A])));
    assert.ok(await denied(() => q("update documents set storage_key='key-b' where user_id=$1", [A]))); assert.ok(await denied(() => q("update documents set user_id=$1 where user_id=$2", [B, A]))); });
});
test("server-written tables are read-only for users", { skip }, async () => {
  const ad = (await pool.query("select id from documents where user_id=$1", [A])).rows[0].id;
  await as(A, async (q) => { assert.ok(await denied(() => q("insert into extracted_document_data(document_id,user_id,full_text) values (gen_random_uuid(),$1,'x')", [A])));
    assert.ok(await denied(() => q("insert into document_chunks(document_id,user_id,content) values ($1,$2,'forged')", [ad, A]))); assert.ok(await denied(() => q("insert into processing_jobs(document_id,user_id,kind) values ($1,$2,'x')", [ad, A]))); });
});
test("audit events cannot be edited or deleted by their owner", { skip }, async () => { await as(A, async (q) => { assert.equal((await q("update audit_events set event='x'")).rowCount, 0); assert.equal((await q("delete from audit_events")).rowCount, 0); }); });
test("full-text and vector search never return another user's data", { skip }, async () => {
  await as(A, async (q) => { const t = (await q("select title from search_documents('secret')")).rows.map((r: any) => r.title); assert.deepEqual(t, ["secret-a"]);
    const m = (await q(`select content from match_chunks(${vec}, 10)`)).rows.map((r: any) => r.content); assert.deepEqual(m, ["secret chunk a"]); });
});
test("users cannot call the rate-limit function", { skip }, async () => { await as(A, async (q) => { assert.ok(await denied(() => q("select rate_limit_hit('k', 1, 60)"))); }); });
test("rate limiter counts, blocks and resets", { skip }, async () => {
  await pool.query("delete from rate_limits"); const hit = async () => (await pool.query("select rate_limit_hit('t', 2, 1) ok")).rows[0].ok;
  assert.equal(await hit(), true); assert.equal(await hit(), true); assert.equal(await hit(), false); await new Promise((r) => setTimeout(r, 1200)); assert.equal(await hit(), true);
});
test("account deletion removes every row of that user and nothing of the other user", { skip }, async () => {
  await pool.query("delete from auth.users where id=$1", [B]);
  for (const t of [...TABLES.filter((x) => x !== "deletion_requests"), "share_email_codes"]) { const col = t === "profiles" ? "id" : null;
    if (t === "share_link_documents" || t === "share_email_codes") { const r = await pool.query(`select count(*)::int n from ${t} x where exists (select 1 from share_links s where s.id = x.${t === "share_email_codes" ? "link_id" : "share_link_id"} and s.token_hash = 'hash-b')`); assert.equal(r.rows[0].n, 0, t); }
    else assert.equal((await pool.query(`select count(*)::int n from ${t} where ${col ?? "user_id"} = $1`, [B])).rows[0].n, 0, `${t} still has B rows`); }
  assert.equal((await pool.query("select count(*)::int n from deletion_requests where user_id=$1", [B])).rows[0].n, 1, "deletion record is intentionally retained (user id only)");
  assert.equal((await pool.query("select count(*)::int n from documents where user_id=$1", [A])).rows[0].n, 1); assert.equal((await pool.query("select count(*)::int n from document_chunks where user_id=$1", [A])).rows[0].n, 1);
});
