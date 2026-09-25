export type EmailMessage = {
  to: { email: string; name?: string | null };
  from: { email: string; name: string };
  replyTo?: { email: string; name?: string | null };
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  tags?: string[];
};

export type EmailSendResult = {
  provider: string;
  messageId: string;
};

export class EmailProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly retryAfterSeconds = 300,
  ) {
    super(code);
  }
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

class BrevoEmailProvider implements EmailProvider {
  readonly name = "brevo";

  constructor(
    private readonly apiKey: string,
    private readonly sandbox: boolean,
  ) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const headers: Record<string, string> = {
      "Idempotency-Key": message.idempotencyKey,
      "X-Mailin-custom": `outbox_id:${message.idempotencyKey}`,
    };
    if (this.sandbox) headers["X-Sib-Sandbox"] = "drop";

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: message.from,
        to: [message.to],
        replyTo: message.replyTo,
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
        headers,
        tags: message.tags,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const retryAfter = Number(response.headers.get("retry-after") || 300);
      throw new EmailProviderError(
        `brevo_http_${response.status}`,
        retryable,
        Number.isFinite(retryAfter) ? retryAfter : 300,
      );
    }

    const messageId = String(payload?.messageId || "");
    if (!messageId) throw new EmailProviderError("brevo_missing_message_id", true);
    return { provider: this.name, messageId };
  }
}

export function createEmailProvider(env = Deno.env): EmailProvider {
  const provider = (env.get("EMAIL_PROVIDER") || "disabled").toLowerCase();
  if (provider === "brevo") {
    const apiKey = env.get("BREVO_API_KEY") || "";
    if (!apiKey) throw new EmailProviderError("brevo_api_key_missing", false);
    return new BrevoEmailProvider(apiKey, env.get("EMAIL_SANDBOX") === "true");
  }
  throw new EmailProviderError(`email_provider_${provider}_not_configured`, false);
}
