import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});

const constantTimeEqual = (a: string, b: string) => {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
};

const sha256 = async (value: string) => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const configuredSecret = Deno.env.get("BREVO_WEBHOOK_SECRET") || "";
  const suppliedSecret = request.headers.get("x-brevo-webhook-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (!configuredSecret || !constantTimeEqual(configuredSecret, suppliedSecret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const payload = await request.json().catch(() => null);
  if (!payload || (payload.type && payload.type !== "transactional")) return json({ ok: true, ignored: true });

  const providerMessageId = String(payload["message-id"] || payload.messageId || "");
  const eventType = String(payload.event || "unknown").toLowerCase();
  const occurredAt = payload.ts_event
    ? new Date(Number(payload.ts_event) * 1000).toISOString()
    : new Date().toISOString();
  if (!providerMessageId) return json({ ok: false, error: "message_id_missing" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const eventHash = await sha256(`brevo:${providerMessageId}:${eventType}:${occurredAt}`);
  const { data: outbox } = await admin.from("notification_outbox").select("id").eq("provider", "brevo").eq("provider_message_id", providerMessageId).maybeSingle();

  await admin.from("notification_delivery_events").upsert({
    outbox_id: outbox?.id || null,
    provider: "brevo",
    provider_message_id: providerMessageId,
    event_type: eventType,
    event_hash: eventHash,
    occurred_at: occurredAt,
    metadata: {
      reason: String(payload.reason || "").slice(0, 500) || null,
      tag: Array.isArray(payload.tag) ? payload.tag.slice(0, 10) : null,
    },
  }, { onConflict: "event_hash", ignoreDuplicates: true });

  if (outbox?.id) {
    const delivered = ["delivered", "opened", "click"].includes(eventType);
    const failed = ["hard_bounce", "blocked", "spam", "invalid", "error"].includes(eventType);
    const update: Record<string, unknown> = {
      delivery_status: delivered ? "delivered" : failed ? "failed" : eventType,
    };
    if (delivered) update.delivered_at = occurredAt;
    await admin.from("notification_outbox").update(update).eq("id", outbox.id);
  }

  return json({ ok: true });
});
