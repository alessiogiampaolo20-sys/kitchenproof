import "server-only";

/**
 * Email abstraction (§5: Resend). Fail-open by design for reminders: when
 * RESEND_API_KEY is absent (local dev / until provided) the message is logged
 * and the in-app notification row remains the source of truth — email is a
 * channel, never a dependency for compliance flows (§14 rule 1 analogue).
 */
export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "KitchenProof <onboarding@resend.dev>";

  if (!apiKey) {
    console.info(`[email:skipped no RESEND_API_KEY] to=${args.to} subject=${args.subject}`);
    return { sent: false };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [args.to], subject: args.subject, text: args.text }),
  });
  if (!res.ok) {
    console.error(`[email:error] ${res.status} ${await res.text()}`);
    return { sent: false };
  }
  return { sent: true };
}
