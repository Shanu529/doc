export const mailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;
/** Sends plain text via Resend's HTTP API. Messages must never contain document names or contents. */
export async function sendMail(to: string, subject: string, text: string) {
  const r = await fetch(`${process.env.MAIL_BASE_URL ?? "https://api.resend.com"}/emails`, { method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }) });
  if (!r.ok) throw new Error("mail failed");
}
