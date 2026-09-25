import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  createEmailProvider,
  EmailProviderError,
  type EmailMessage,
} from "../_shared/email-provider.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatMoney = (cents: unknown) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(Number(cents || 0) / 100);

const formatDate = (value: unknown, includeTime = false) => {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

const render = (template: string, variables: Record<string, unknown>) => template.replace(
  /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
  (_match, key) => String(variables[key] ?? ""),
);

const renderHtml = (body: string, actionUrl: string) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#0b0807;color:#f6f0e8;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0807;padding:28px 12px">
    <tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #68402f;background:#140d0a">
      <tr><td style="padding:30px 30px 12px;color:#c79977;font-size:12px;letter-spacing:3px">CHALEZINHO VILLE</td></tr>
      <tr><td style="padding:8px 30px 24px;font-family:Georgia,serif;font-size:30px;line-height:1.2">Uma estadia pensada nos detalhes.</td></tr>
      <tr><td style="padding:0 30px 26px;color:#ded3ca;font-size:16px;line-height:1.7">${escapeHtml(body)}</td></tr>
      <tr><td style="padding:0 30px 32px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#9b2b0d;color:#fff;text-decoration:none;padding:14px 22px">Acessar Área do Hóspede</a></td></tr>
      <tr><td style="padding:22px 30px;border-top:1px solid #3b271f;color:#9d8e84;font-size:12px;line-height:1.6">Guarapari · Espírito Santo<br>Este é um e-mail transacional relacionado à sua conta ou reserva.</td></tr>
    </table></td></tr>
  </table>
</body></html>`;

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const configuredDispatchSecret = Deno.env.get("NOTIFICATION_DISPATCH_SECRET") || "";
  const suppliedDispatchSecret = request.headers.get("x-notification-dispatch-secret") || "";
  if (!configuredDispatchSecret || suppliedDispatchSecret !== configuredDispatchSecret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const fromEmail = Deno.env.get("EMAIL_FROM_ADDRESS") || "";
  const fromName = Deno.env.get("EMAIL_FROM_NAME") || "Chalezinho Ville";
  const replyToEmail = Deno.env.get("EMAIL_REPLY_TO") || fromEmail;
  const siteUrl = (Deno.env.get("EMAIL_SITE_URL") || "https://chalezinhoville.com.br").replace(/\/$/, "");

  if (!supabaseUrl || !serviceRoleKey || !fromEmail) {
    return json({ ok: false, error: "email_runtime_not_configured" }, 503);
  }

  let provider;
  try {
    provider = createEmailProvider();
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "provider_not_configured" }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claimed, error: claimError } = await admin.rpc("claim_notification_outbox", { p_limit: 20 });
  if (claimError) return json({ ok: false, error: "outbox_claim_failed" }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const item of claimed || []) {
    try {
      const [{ data: template }, { data: reservation }] = await Promise.all([
        admin.from("notification_templates").select("subject,body_text,active,provider_managed").eq("code", item.template_code).maybeSingle(),
        item.reservation_id
          ? admin.from("reservations").select("guest_email,guest_name,confirmation_code,check_in,check_out,total_amount,properties(name)").eq("id", item.reservation_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (!template?.active || template.provider_managed) throw new EmailProviderError("template_not_dispatchable", false);

      let recipientEmail = reservation?.guest_email || "";
      let recipientName = reservation?.guest_name || "";
      if (!recipientEmail && item.user_id) {
        const { data } = await admin.auth.admin.getUserById(item.user_id);
        recipientEmail = data?.user?.email || "";
        recipientName = String(data?.user?.user_metadata?.full_name || "");
      }
      if (!recipientEmail) throw new EmailProviderError("recipient_email_missing", false);

      const payload = item.payload || {};
      const variables: Record<string, unknown> = {
        ...payload,
        confirmation_code: payload.confirmation_code || reservation?.confirmation_code,
        property_name: (reservation as any)?.properties?.name,
        check_in: formatDate(payload.check_in || reservation?.check_in),
        check_out: formatDate(payload.check_out || reservation?.check_out),
        amount: formatMoney(payload.amount_cents || payload.total_amount_cents || 0),
        payment_due_at: formatDate(payload.payment_due_at, true),
      };
      const subject = render(template.subject, variables);
      const text = render(template.body_text, variables);
      const actionUrl = `${siteUrl}/conta.html`;
      const message: EmailMessage = {
        to: { email: recipientEmail, name: recipientName || undefined },
        from: { email: fromEmail, name: fromName },
        replyTo: replyToEmail ? { email: replyToEmail, name: fromName } : undefined,
        subject,
        text: `${text}\n\nÁrea do Hóspede: ${actionUrl}`,
        html: renderHtml(text, actionUrl),
        idempotencyKey: item.id,
        tags: ["transactional", String(item.template_code).slice(0, 50)],
      };

      const sent = await provider.send(message);
      await admin.from("notification_outbox").update({
        provider: sent.provider,
        provider_message_id: sent.messageId,
        delivery_status: "accepted",
      }).eq("id", item.id);
      await admin.rpc("complete_notification_outbox", { p_id: item.id, p_sent: true });
      results.push({ id: item.id, status: "sent", provider: sent.provider });
    } catch (error) {
      const providerError = error instanceof EmailProviderError ? error : new EmailProviderError("email_dispatch_failed", true);
      if (!providerError.retryable) {
        await admin.from("notification_outbox").update({
          attempt_count: item.max_attempts,
        }).eq("id", item.id).eq("status", "processing");
      }
      await admin.rpc("complete_notification_outbox", {
        p_id: item.id,
        p_sent: false,
        p_error: providerError.code,
        p_retry_after_seconds: providerError.retryable ? providerError.retryAfterSeconds : 86400,
      });
      results.push({ id: item.id, status: "failed", error: providerError.code });
    }
  }

  return json({ ok: true, provider: provider.name, processed: results.length, results });
});
