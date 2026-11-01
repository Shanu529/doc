import test from "node:test"; import assert from "node:assert/strict"; import http from "http"; import QRCode from "qrcode"; import jsQR from "jsqr"; import { PNG } from "pngjs";
import { gateStatus, maskEmail } from "../src/lib/share"; import { hashToken, proofCookie, newCode, hashCode, hashPin, verifyPin } from "../src/lib/token";
const th = hashToken("tok"); const base = { token_hash: th, expires_at: new Date(Date.now() + 3600e3).toISOString(), revoked_at: null, pin_hash: null, recipient_email: null };
const now = new Date();
test("unknown, expired and revoked links are invalid", () => { assert.equal(gateStatus(null, now, {}), "invalid"); assert.equal(gateStatus({ ...base, expires_at: new Date(Date.now() - 1000).toISOString() }, now, {}), "invalid"); assert.equal(gateStatus({ ...base, revoked_at: new Date().toISOString() }, now, {}), "invalid"); });
test("an open link is granted; revocation wins over valid proofs", () => { assert.equal(gateStatus(base, now, {}), "ok"); const l = { ...base, pin_hash: hashPin("1234"), revoked_at: new Date().toISOString() }; assert.equal(gateStatus(l, now, { pin: proofCookie("pin", th) }), "invalid"); });
test("PIN links need the PIN proof, and forged or wrong-link proofs fail", () => { const l = { ...base, pin_hash: hashPin("1234") }; assert.equal(gateStatus(l, now, {}), "pin"); assert.equal(gateStatus(l, now, { pin: "forged" }), "pin"); assert.equal(gateStatus(l, now, { pin: proofCookie("pin", hashToken("other")) }), "pin"); assert.equal(gateStatus(l, now, { pin: proofCookie("pin", th) }), "ok"); });
test("email-restricted links need the email proof; a PIN proof does not substitute", () => { const l = { ...base, recipient_email: "dr@clinic.test" }; assert.equal(gateStatus(l, now, {}), "email"); assert.equal(gateStatus(l, now, { email: proofCookie("pin", th) }), "email"); assert.equal(gateStatus(l, now, { email: proofCookie("email", th) }), "ok"); });
test("PIN plus email requires both", () => { const l = { ...base, recipient_email: "a@b.test", pin_hash: hashPin("4821") }; assert.equal(gateStatus(l, now, { email: proofCookie("email", th) }), "pin"); assert.equal(gateStatus(l, now, { email: proofCookie("email", th), pin: proofCookie("pin", th) }), "ok"); });
test("email codes are 6 digits, bound to the link, and not stored in the clear", () => { const c = newCode(); assert.match(c, /^\d{6}$/); assert.notEqual(hashCode("L1", c), c); assert.notEqual(hashCode("L1", c), hashCode("L2", c)); assert.ok(verifyPin("4821", hashPin("4821")) && !verifyPin("4822", hashPin("4821"))); assert.equal(maskEmail("doctor@clinic.test"), "d***@clinic.test"); });
test("QR code encodes exactly the share URL and nothing else", async () => {
  const url = "https://vault.example/s/abc123_-XYZ"; const png = PNG.sync.read(Buffer.from((await QRCode.toDataURL(url, { margin: 1, width: 240 })).split(",")[1], "base64"));
  assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, url);
});
test("verification email contains the code only, no document details", async () => {
  let body = ""; const srv = http.createServer((q, r) => { let d = ""; q.on("data", (c) => (d += c)); q.on("end", () => { body = d; r.end("{}"); }); }); await new Promise<void>((r) => srv.listen(0, r));
  process.env.RESEND_API_KEY = "k"; process.env.MAIL_FROM = "v@x.test"; process.env.MAIL_BASE_URL = `http://127.0.0.1:${(srv.address() as any).port}`;
  const { sendMail } = await import("../src/lib/mail"); await sendMail("r@x.test", "Your verification code", "Your verification code is 123456."); srv.close();
  const j = JSON.parse(body); assert.deepEqual(j.to, ["r@x.test"]); assert.match(j.text, /123456/); assert.ok(!/pdf|report|blood/i.test(j.text));
});
