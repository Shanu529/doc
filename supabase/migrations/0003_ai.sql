alter table ai_summaries add column if not exists kind text not null default 'summary', add column if not exists title text;
alter table share_links add column if not exists summary_id uuid references ai_summaries on delete cascade;
create index if not exists chunks_hnsw on document_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists chunks_fts on document_chunks using gin (to_tsvector('simple', content));
create or replace function match_chunks(query_embedding vector(1536), match_count int default 10)
returns table(document_id uuid, page int, content text, similarity float) language sql security invoker stable as $$
 select c.document_id, c.page, c.content, 1 - (c.embedding <=> query_embedding) from document_chunks c join documents d on d.id = c.document_id
 where d.deleted_at is null and c.embedding is not null order by c.embedding <=> query_embedding limit match_count $$;
-- Fixed-window rate limiter, callable only with the service role.
create table if not exists rate_limits (key text primary key, window_start timestamptz not null default now(), hits int not null default 0);
alter table rate_limits enable row level security;
create or replace function rate_limit_hit(k text, max_hits int, window_seconds int) returns boolean language plpgsql security definer set search_path = public as $$
declare c int; begin
 insert into rate_limits(key, window_start, hits) values (k, now(), 1)
 on conflict (key) do update set
  hits = case when rate_limits.window_start < now() - make_interval(secs => window_seconds) then 1 else rate_limits.hits + 1 end,
  window_start = case when rate_limits.window_start < now() - make_interval(secs => window_seconds) then now() else rate_limits.window_start end
 returning hits into c;
 return c <= max_hits; end $$;
revoke all on function rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function rate_limit_hit(text, int, int) to service_role;
