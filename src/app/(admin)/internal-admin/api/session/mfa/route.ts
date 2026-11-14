import { handleCodeStep } from "@/lib/admin/codeStep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Etapa 2 do login: código TOTP de 6 dígitos → cria a sessão de 14 dias. */
export function POST(request: Request) {
  return handleCodeStep(request, "mfa");
}
