const minimumScore = 0.5;

type Settings = {
  projectId: string;
  siteKey: string;
  apiKey: string;
  hosts: string[];
};

export function checkoutCaptchaSettings(read: (name: string) => string | undefined): Settings | null {
  const projectId = read("RECAPTCHA_PROJECT_ID")?.trim() || "";
  const siteKey = read("RECAPTCHA_SITE_KEY")?.trim() || "";
  const apiKey = read("RECAPTCHA_API_KEY")?.trim() || "";
  const hosts = (read("RECAPTCHA_ALLOWED_HOSTS") || "").split(",").map(host => host.trim().toLowerCase()).filter(Boolean);
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) ||
      !/^[\w-]{20,128}$/.test(siteKey) || !/^[\w-]{20,128}$/.test(apiKey) ||
      !hosts.length || hosts.some(host => !/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(host))) return null;
  return { projectId, siteKey, apiKey, hosts };
}

export type CheckoutCaptchaAction = "checkout_payment" | "post_booking_payment";

export async function verifyCheckoutCaptcha(
  settings: Settings | null,
  origin: string | null,
  token: unknown,
  action: CheckoutCaptchaAction,
  request: typeof fetch = fetch,
) {
  if (!settings) return "checkout_captcha_unavailable";
  let hostname: string;
  try {
    const page = new URL(origin || "");
    if (page.protocol !== "https:" || page.origin !== origin || !settings.hosts.includes(page.hostname)) {
      return "checkout_captcha_rejected";
    }
    hostname = page.hostname;
  } catch {
    return "checkout_captcha_rejected";
  }
  if (typeof token !== "string" || !token || token.length > 8192 || /\s/.test(token)) {
    return "checkout_captcha_required";
  }
  try {
    const response = await request(`https://recaptchaenterprise.googleapis.com/v1/projects/${settings.projectId}/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": settings.apiKey },
      body: JSON.stringify({ event: { token, siteKey: settings.siteKey, expectedAction: action } }),
      redirect: "error",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return "checkout_captcha_unavailable";
    const assessment = await response.json();
    const properties = assessment?.tokenProperties;
    const score = assessment?.riskAnalysis?.score;
    if (properties?.valid !== true || properties.action !== action || properties.hostname !== hostname ||
        typeof score !== "number" || !Number.isFinite(score) || score < minimumScore || score > 1) {
      return "checkout_captcha_rejected";
    }
    return null;
  } catch {
    return "checkout_captcha_unavailable";
  }
}
