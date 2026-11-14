import "server-only";

/**
 * Alerta em tempo real via webhook (Discord ou Slack). Opcional: só dispara se
 * ADMIN_ALERT_WEBHOOK_URL estiver definida (https). Melhor esforço, com timeout curto —
 * nunca derruba o fluxo de login.
 */
export async function sendAdminAlert(text: string): Promise<void> {
  const url = process.env.ADMIN_ALERT_WEBHOOK_URL;
  if (!url || !url.startsWith("https://")) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `content` = Discord, `text` = Slack.
      body: JSON.stringify({ content: text.slice(0, 1900), text: text.slice(0, 1900) }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    console.error("admin alert webhook failed");
  } finally {
    clearTimeout(timeoutId);
  }
}
