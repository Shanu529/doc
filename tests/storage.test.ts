// Exercises the real storage module against an S3-compatible emulator (moto) by default. Set LIVE_R2=1 with real R2_* values to run it against Cloudflare R2.
import test, { before } from "node:test"; import assert from "node:assert/strict"; import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";
const live = process.env.LIVE_R2 === "1"; const emu = !live && !!process.env.R2_ENDPOINT; const skip = !live && !emu;
let storage: any; const key = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
before(async () => { if (skip) return;
  if (emu) { process.env.R2_BUCKET = "vault-test"; process.env.R2_ACCESS_KEY_ID = "t"; process.env.R2_SECRET_ACCESS_KEY = "t"; process.env.R2_ACCOUNT_ID = "t";
    await new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: "t", secretAccessKey: "t" } }).send(new CreateBucketCommand({ Bucket: "vault-test" })).catch(() => {}); }
  storage = (await import("../src/lib/storage")).storage; });
test("put, get and exists round-trip bytes exactly", { skip }, async () => { const b = Buffer.from([0, 1, 2, 250, 255, 37, 80, 68, 70]); await storage.put(key, b, "application/pdf"); assert.ok(await storage.exists(key)); assert.ok((await storage.get(key)).equals(b)); });
test("signed download URL serves the file as an attachment with the original name", { skip }, async () => { const u = await storage.signedGetUrl(key, "report é.pdf", 60); const r = await fetch(u); assert.equal(r.status, 200); assert.match(r.headers.get("content-disposition") ?? "", /attachment/); assert.equal((await r.arrayBuffer()).byteLength, 9); });
test("preview URL is inline with the validated content type", { skip }, async () => { const r = await fetch(await storage.signedGetUrl(key, "a.pdf", 60, "application/pdf")); assert.match(r.headers.get("content-disposition") ?? "", /inline/); assert.equal(r.headers.get("content-type"), "application/pdf"); });
test("a tampered signature is rejected", { skip: skip || emu }, async () => { const u = new URL(await storage.signedGetUrl(key, "a.pdf", 60)); u.searchParams.set("X-Amz-Signature", "0".repeat(64)); assert.notEqual((await fetch(u)).status, 200); });
test("expired signed URLs stop working", { skip: skip || emu }, async () => { const u = await storage.signedGetUrl(key, "a.pdf", 1); await new Promise((r) => setTimeout(r, 2500)); assert.notEqual((await fetch(u)).status, 200); });
test("remove deletes the object and delete is idempotent", { skip }, async () => { await storage.remove(key); assert.equal(await storage.exists(key), false); await storage.remove(key); await assert.rejects(() => storage.get(key)); });
