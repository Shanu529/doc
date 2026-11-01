import test from "node:test"; import assert from "node:assert/strict";
import { sniffMime } from "../src/lib/files"; import { newToken, hashToken, hashPin, verifyPin } from "../src/lib/token"; import { classify } from "../src/lib/process-classify";
test("rejects spoofed file types", () => { assert.equal(sniffMime(Buffer.from("<html>fake.pdf")), null); assert.equal(sniffMime(Buffer.from("%PDF-1.7")), "application/pdf"); });
test("tokens are unique, long, and hashed", () => { const a = newToken(), b = newToken(); assert.notEqual(a, b); assert.ok(a.length >= 43); assert.notEqual(hashToken(a), a); assert.equal(hashToken(a), hashToken(a)); });
test("PIN hashing verifies only the right PIN", () => { const h = hashPin("4821"); assert.ok(verifyPin("4821", h)); assert.ok(!verifyPin("0000", h)); });
test("classifier flags uncertainty", () => { assert.equal(classify("hello world").confidence, 0); assert.equal(classify("Blood test: hemoglobin and cholesterol, reference range").type, "lab_report"); });
