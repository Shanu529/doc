create extension if not exists vector;
create table profiles (id uuid primary key references auth.users on delete cascade, display_name text, created_at timestamptz default now());
create table folders (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, parent_id uuid references folders on delete cascade, name text not null, created_at timestamptz default now());
create table documents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 folder_id uuid references folders on delete set null,
 title text not null, original_name text not null, mime_type text not null, size_bytes bigint not null,
 storage_key text not null unique,           -- random key, never derived from user data
 doc_type text, doc_date date, expiry_date date, issuer text, tags text[] default '{}', notes text,
 metadata_status text not null default 'unverified' check (metadata_status in ('unverified','ai_extracted','user_confirmed')),
 processing_status text not null default 'pending' check (processing_status in ('pending','processing','done','failed')),
 archived_at timestamptz, deleted_at timestamptz,   -- soft delete; purge after retention period
 created_at timestamptz default now());
create index on documents (user_id, created_at desc);
create index on documents using gin (tags);
create table extracted_document_data (document_id uuid primary key references documents on delete cascade, user_id uuid not null references auth.users on delete cascade, full_text text, tsv tsvector generated always as (to_tsvector('simple', coalesce(full_text,''))) stored, confidence numeric, updated_at timestamptz default now());
create index on extracted_document_data using gin (tsv);
create table document_chunks (id uuid primary key default gen_random_uuid(), document_id uuid not null references documents on delete cascade, user_id uuid not null references auth.users on delete cascade, page int, content text not null, embedding vector(1536));
create table ai_summaries (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, document_ids uuid[] not null, body text not null, source_refs jsonb not null default '[]', provider text, created_at timestamptz default now());
create table processing_jobs (id uuid primary key default gen_random_uuid(), document_id uuid not null references documents on delete cascade, user_id uuid not null references auth.users on delete cascade, kind text not null, status text not null default 'queued', error text, attempts int default 0, created_at timestamptz default now());
create table share_links (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, token_hash text not null unique, expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz default now());
create table share_link_documents (share_link_id uuid references share_links on delete cascade, document_id uuid references documents on delete cascade, primary key (share_link_id, document_id));
create table audit_events (id bigint generated always as identity primary key, user_id uuid references auth.users on delete set null, event text not null, ref_id uuid, created_at timestamptz default now()); -- never store tokens or document contents
create table deletion_requests (id uuid primary key default gen_random_uuid(), user_id uuid not null, requested_at timestamptz default now(), completed_at timestamptz);

-- Row-level security: owner-only. Share recipients never query the DB directly; the server validates tokens.
do $$ declare t text; begin
 foreach t in array array['profiles','folders','documents','extracted_document_data','document_chunks','ai_summaries','processing_jobs','share_links','audit_events','deletion_requests'] loop
  execute format('alter table %I enable row level security', t);
  execute format('create policy "owner" on %I for all using (%s = auth.uid()) with check (%s = auth.uid())', t, case when t='profiles' then 'id' else 'user_id' end, case when t='profiles' then 'id' else 'user_id' end);
 end loop; end $$;
alter table share_link_documents enable row level security;
create policy "owner" on share_link_documents for all using (exists (select 1 from share_links s where s.id = share_link_id and s.user_id = auth.uid()));
