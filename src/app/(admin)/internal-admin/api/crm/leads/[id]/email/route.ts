import { hasValidAdminGate } from "@/lib/admin/gate";
import { readGuardedJson } from "@/lib/admin/requestContext";
import { getAdminProfile, getAdminSession } from "@/lib/admin/session";
import {
  EmailProviderError,
  LeadNotFoundError,
  RecipientNotAllowedError,
  isEmailConfigured,
  listLeadEmails,
  sendLeadEmail,
} from "@/lib/admin/crm/email";
import { EMAIL_MAX_BYTES, validateSendEmail } from "@/lib/admin/crm/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const isId = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const invalidInput = () => Response.json({ error: "invalid_input" }, { status: 400 });

/**
 * Histórico de e-mails enviados para o lead: `{ configured, emails }`.
 * Só leitura: exige o gate do proxy + sessão (GET da mesma origem não manda header Origin,
 * então não usa `guardAdminRequest`; o cookie SameSite=Strict já impede uso cruzado).
 */
export async function GET(request: Request, { params }: Context) {
  if (!(await hasValidAdminGate(request.headers))) return new Response(null, { status: 404 });
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isId(id)) return invalidInput();
  try {
    return Response.json({ configured: isEmailConfigured(), emails: await listLeadEmails(id) });
  } catch (error) {
    console.error("crm list lead emails error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * Envia um e-mail para o lead pelo Resend. Corpo: `{ to, subject, body }`.
 * `to` precisa ser o e-mail do lead ou do contato vinculado.
 * Resposta: 200 { ok } · 400 invalid_input · 401 · 404 · 502 send_failed · 503 email_not_configured.
 */
export async function POST(request: Request, { params }: Context) {
  const body = await readGuardedJson(request, EMAIL_MAX_BYTES);
  if (body instanceof Response) return body;
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isId(id)) return invalidInput();
  if (!isEmailConfigured()) return Response.json({ error: "email_not_configured" }, { status: 503 });

  const parsed = validateSendEmail(body);
  if (!parsed.ok) return invalidInput();

  try {
    const profile = await getAdminProfile(session);
    const actor = { uid: session.uid, name: profile.name ?? profile.email ?? session.uid };
    await sendLeadEmail(id, parsed.value, actor, profile.email);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof LeadNotFoundError) return Response.json({ error: "not_found" }, { status: 404 });
    if (error instanceof RecipientNotAllowedError) return invalidInput();
    if (error instanceof EmailProviderError) {
      console.error("crm send email provider error", error.message);
      return Response.json({ error: "send_failed" }, { status: 502 });
    }
    console.error("crm send email error", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
