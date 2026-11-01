# Document Vault (Next.js + Supabase + Cloudflare R2)

Private document and medical-record vault with search, AI summaries and grounded Q&A, a medical timeline, and revocable share links.
**Status: not production-ready until the "Required before launch" checklist below is done.** Evidence is listed honestly in "Test results".

## Quick start
```
cp .env.example .env.local        # fill in values (see Environment)
npm install --legacy-peer-deps
# apply supabase/migrations/0001 .. 0004 in order (Supabase SQL editor or `supabase db push`)
npm run dev
```
Checks: `npm run typecheck`, `npm test`, `npm run build`.

## Environment (`.env.example` has every variable)
| Variable | Purpose |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY | Browser-safe Supabase values |
| SUPABASE_SERVICE_ROLE_KEY | Server only. Bypasses RLS. Never expose, never prefix with NEXT_PUBLIC |
| APP_URL | Public https URL (used in share links and redirects) |
| R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET | Private R2 bucket. Token scoped to that bucket, Object Read & Write only |
| WORKER_SECRET | Required header for `POST /api/v1/jobs/run` |
| SHARE_COOKIE_SECRET | Signs share-link proof cookies. **App refuses to run share flows in production without it** |
| AI_API_KEY, AI_MODEL | Summaries, Q&A and OCR (Anthropic). Empty disables AI |
| OCR_PROVIDER=anthropic | Enables OCR (sends the file to the provider). OCR_MAX_PAGES (40), OCR_BATCH_PAGES (8) |
| EMBEDDING_API_KEY, EMBEDDING_MODEL | Semantic search (1536-dim, OpenAI-compatible). Empty = full-text only |
| RESEND_API_KEY, MAIL_FROM | Recipient email verification for share links. Without them that option is refused |
| AI_DAILY_LIMIT, OCR_DAILY_LIMIT, MAX_UPLOAD_MB, TRASH_RETENTION_DAYS, MAX_CHUNKS | Cost and retention limits |
| R2_ENDPOINT | Leave empty in real use. Only for S3-compatible emulators in tests |

Use separate Supabase projects, R2 buckets, API keys and secrets for development and production. Never commit `.env*`.

## Supabase setup
1. Create the project. Run migrations 0001-0004 in order. `0004_hardening.sql` is a security fix; do not skip it.
2. Auth: enable email confirmation, set minimum password length, add `APP_URL` and `APP_URL/reset` to redirect URLs, enable CAPTCHA/bot protection if available on your plan.
3. Confirm every table shows "RLS enabled" in the dashboard (the test suite checks this too).

## Cloudflare R2 setup
Create a bucket with **no public access and no custom public domain**. Create an API token limited to that bucket (Object Read & Write). No CORS rules are needed: files are fetched by redirect from short-lived signed URLs.

## Background worker
Schedule `POST $APP_URL/api/v1/jobs/run` with header `x-worker-secret: $WORKER_SECRET` every 1-5 minutes (Vercel Cron or GitHub Actions). It processes queued documents and purges trash older than `TRASH_RETENTION_DAYS`. OCR of long scans runs in sequential batches and can take minutes: the route allows 300 s, but **Vercel Hobby caps functions at 60 s**, so use a paid plan or lower `OCR_MAX_PAGES`.

## Deploy (Vercel)
Import the repo, set all env vars for Production, add the cron, deploy, then run the post-deploy checks below. The PDF fonts in `assets/fonts` are bundled via `outputFileTracingIncludes` (verified in the build output). Fonts are Noto Sans (SIL OFL 1.1).

## What is implemented
Accounts, password reset, folders, tags/metadata, filters, archive/trash/restore/permanent delete with retention, uploads with progress and retry, in-app preview, text extraction, OCR (batched, with partial-processing reporting), classification, embeddings, hybrid search, summaries and grounded Q&A with mechanical citation checks, medical timeline, doctor-ready PDF (Latin, Greek, Cyrillic, Devanagari), share links (hashed token, expiry, revoke, PIN with lockout, **recipient email verification**, summary sharing, QR of URL only), **share-history dashboard** (`/dashboard/shares`), data export, account deletion with password re-entry, **fail-closed rate limiting**.

## Security review: findings fixed in 0004
The two-user tests exposed real cross-user paths that a client holding only the public anon key could use: (1) inserting another user's document into your own share link, (2) pointing a share link at another user's summary, (3) a summary referencing other users' documents, (4) editing `storage_key`/`user_id` of your own document, (5) moving a document into another user's folder, (6) forging chunks/extracted text/jobs and deleting audit events. All are blocked by RLS/trigger changes and covered by tests. The server also filters share output by the link creator's `user_id`.

## Backup, recovery, export, deletion
- **Database**: Supabase daily backups depend on plan; point-in-time recovery needs a paid add-on. Enable PITR for production and test a restore into a scratch project at least quarterly. `rate_limits` and `share_email_codes` need no backup.
- **Files**: R2 has no automatic cross-bucket backup. Run a scheduled copy (for example `rclone sync` to a second bucket/provider with a separate token) and test restoring a file. Check Cloudflare's current docs for object versioning/lock options before relying on them.
- **Recovery order**: restore DB, restore bucket, redeploy, rotate secrets if compromise is suspected, run the worker so any missing chunks/embeddings regenerate (re-trigger Retry on documents).
- **Export**: `/api/v1/account/export` returns metadata, extracted text, summaries, share-link metadata and audit events as JSON. Original files are downloaded individually. No bulk-zip export yet.
- **Deletion**: trash is soft delete; permanent delete removes the R2 object, the row, and cascades text, chunks/embeddings, summary references and share entries. Account deletion deletes every R2 object first (if any fail the account is kept and you can retry), then the auth user, which cascades every table. A `deletion_requests` row (user id and timestamps only) is intentionally retained as proof of deletion. **Provider backups still contain the data until they expire**; state your backup retention period in your privacy policy. AI/embedding/OCR providers have their own retention: review their terms.

## Required before launch
1. Run the credential-gated tests (below) against dev Supabase, R2 and AI keys and record results.
2. Manual end-to-end pass in a browser with two real accounts (sign-up email, upload, process, search, ask, share with PIN and with email code, revoke, delete account). No browser E2E suite exists yet.
3. Independent security review and penetration test. Do not claim HIPAA, SOC 2 or similar.
4. Set provider spend limits and alerts; set Supabase PITR and the R2 backup job; add error monitoring that does not log document content.
5. Legal: privacy policy, data-processing terms with providers, health-data regulations for your markets.

## Test results (run on 2026-10-31 in a Linux sandbox)
| Check | Result |
|---|---|
| `tsc --noEmit` | passed |
| `next build` | passed |
| `npm test` | **52 passed, 0 failed, 10 skipped** |

Ran for real: migrations 0001-0004 on Postgres 16 + pgvector; 15 two-user RLS/deletion tests (own-rows-only on every table, anon sees nothing, cross-user update/delete/insert blocked, share/summary/folder/storage_key attacks blocked, server-only tables read-only, audit immutability, FTS and vector search isolation, rate-limit function privileges and window reset, account-deletion cascade); storage module against an **S3 emulator (moto), not R2**; fail-closed rate limiter; share gating (expired, revoked, PIN, email, both, forged proofs); QR decode equals the URL only; email-code hashing; verification email content; OCR batching/page cap/truncation reporting and provider-error handling against a **mock provider**; citation checker (correct, incorrect value, wrong source, nonexistent source, uncited, contradictory); PDF fonts including a visual check of Devanagari.

Not run (need external credentials or infrastructure), in `tests/live` and `tests/storage.test.ts`:
- Real Supabase Auth + REST two-user test: needs `LIVE_SUPABASE_URL`, `LIVE_SUPABASE_ANON_KEY`, `LIVE_SUPABASE_SERVICE_ROLE_KEY` (dev project).
- Real R2 (tamper and expiry checks): `LIVE_R2=1` plus real `R2_*` (dev bucket). Two tests are skipped on the emulator.
- Real model behaviour (grounded Q&A: correct, missing, contradictory, ambiguous, prompt injection; OCR): `LIVE_AI_API_KEY`.
- Real embeddings: `LIVE_EMBEDDING_API_KEY`.
Run all with `npm test`; also set `DATABASE_URL` (throwaway Postgres with pgvector) for the RLS suite, which is skipped without it.

Not tested at all: HTTP route handlers end to end (auth cookies, upload, worker, share pages), browser UI/E2E, email delivery via Resend, the Q&A answer quality of a real model, load/performance.

## Known limitations
- PDF export covers Latin, Greek, Cyrillic and Devanagari; Arabic, CJK and others print as "?" and the PDF says so.
- Citation checks are mechanical (cited source exists, numbers appear in the cited text); they cannot prove a claim is semantically right.
- OCR is capped (`OCR_MAX_PAGES`); longer documents and truncated output are flagged "Partially processed" in the list. Page boundaries can be approximate and are flagged.
- Share access history stores time and event only (no IP, by design). Links cannot be re-shown after creation.
- Numeric dates are read day-first and stay unverified until confirmed.
