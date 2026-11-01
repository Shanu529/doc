-- Findings from the security review: tighten RLS so a client with only the anon key cannot cross user boundaries.
alter table share_links add column if not exists recipient_email text, add column if not exists label text;
alter table documents add column if not exists partial boolean not null default false, add column if not exists processing_note text;
create table if not exists share_email_codes (link_id uuid primary key references share_links on delete cascade, code_hash text not null, expires_at timestamptz not null, attempts int not null default 0, sent_at timestamptz not null default now());
alter table share_email_codes enable row level security; -- no policies: service role only

-- 1. documents: folder must belong to the same user; storage_key/user_id/mime/size are immutable after insert.
drop policy "owner" on documents;
create policy "owner" on documents for all using (user_id = auth.uid())
 with check (user_id = auth.uid() and (folder_id is null or exists (select 1 from folders f where f.id = folder_id and f.user_id = auth.uid())));
create or replace function documents_immutable() returns trigger language plpgsql as $$
begin
 if auth.uid() is not null and (new.storage_key is distinct from old.storage_key or new.user_id is distinct from old.user_id or new.mime_type is distinct from old.mime_type or new.size_bytes is distinct from old.size_bytes) then
  raise exception 'immutable column'; end if; return new; end $$;
create trigger documents_immutable_t before update on documents for each row execute function documents_immutable();
-- 2. Server-written tables become read-only for end users (the service role writes them).
do $$ declare t text; begin foreach t in array array['extracted_document_data','document_chunks','processing_jobs'] loop
 execute format('drop policy "owner" on %I', t); execute format('create policy "owner_read" on %I for select using (user_id = auth.uid())', t); end loop; end $$;
-- 3. Audit trail: users can read and append their own events, never edit or delete them.
drop policy "owner" on audit_events;
create policy "owner_read" on audit_events for select using (user_id = auth.uid());
create policy "owner_append" on audit_events for insert with check (user_id = auth.uid());
drop policy "owner" on deletion_requests;
create policy "owner_read" on deletion_requests for select using (user_id = auth.uid());
create policy "owner_append" on deletion_requests for insert with check (user_id = auth.uid());
-- 4. Summaries may only reference the owner's documents.
drop policy "owner" on ai_summaries;
create policy "owner" on ai_summaries for all using (user_id = auth.uid())
 with check (user_id = auth.uid() and not exists (select 1 from unnest(document_ids) d where not exists (select 1 from documents x where x.id = d and x.user_id = auth.uid())));
-- 5. Share links may only expose the owner's summaries and documents.
drop policy "owner" on share_links;
create policy "owner" on share_links for all using (user_id = auth.uid())
 with check (user_id = auth.uid() and (summary_id is null or exists (select 1 from ai_summaries s where s.id = summary_id and s.user_id = auth.uid())));
drop policy "owner" on share_link_documents;
create policy "owner" on share_link_documents for all
 using (exists (select 1 from share_links s where s.id = share_link_id and s.user_id = auth.uid()))
 with check (exists (select 1 from share_links s where s.id = share_link_id and s.user_id = auth.uid()) and exists (select 1 from documents d where d.id = document_id and d.user_id = auth.uid()));
