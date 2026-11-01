import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export function hashPin(pin: string) { const s = randomBytes(16); return `${s.toString("hex")}:${scryptSync(pin, s, 32).toString("hex")}`; }
export function verifyPin(pin: string, stored: string) {
  const [s, h] = stored.split(":"); const d = scryptSync(pin, Buffer.from(s, "hex"), 32);
  return timingSafeEqual(d, Buffer.from(h, "hex"));
}
export const accessCookie = (tokenHash: string) => createHmac("sha256", process.env.SHARE_COOKIE_SECRET ?? "dev-only").update(tokenHash).digest("hex");

import { randomInt } from "crypto";
const secret = () => { const s = process.env.SHARE_COOKIE_SECRET; if (!s && process.env.NODE_ENV === "production") throw new Error("SHARE_COOKIE_SECRET is required in production"); return s ?? "dev-only"; };
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
export const hashCode = (linkId: string, code: string) => createHmac("sha256", secret()).update(`code:${linkId}:${code}`).digest("hex");
export const proofCookie = (kind: "pin" | "email", tokenHash: string) => createHmac("sha256", secret()).update(`${kind}:${tokenHash}`).digest("hex");
export const safeEq = (a?: string, b?: string) => !!a && !!b && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
