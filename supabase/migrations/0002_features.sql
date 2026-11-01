alter table documents add column if not exists processing_error text, add column if not exists type_confidence numeric;
create index if not exists documents_folder_idx on documents (folder_id);
alter table share_links add column if not exists pin_hash text, add column if not exists failed_attempts int not null default 0;
-- security invoker: RLS applies, so users only ever search their own documents.
create or replace function search_documents(q text) returns table(id uuid, title text, doc_type text, snippet text, rank real)
language sql security invoker stable as $$
 select d.id, d.title, d.doc_type,
  coalesce(ts_headline('simple', left(e.full_text, 20000), websearch_to_tsquery('simple', q), 'MaxFragments=1,MaxWords=20'), ''),
  coalesce(ts_rank(e.tsv, websearch_to_tsquery('simple', q)), 0)
 from documents d left join extracted_document_data e on e.document_id = d.id
 where d.deleted_at is null and (e.tsv @@ websearch_to_tsquery('simple', q) or d.title ilike '%' || q || '%' or d.doc_type ilike '%' || q || '%')
 order by 5 desc, d.created_at desc limit 50 $$;
