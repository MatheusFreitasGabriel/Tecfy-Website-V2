import { handleCodeStep } from "@/lib/admin/codeStep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Primeiro acesso (janela liberada): confirma o cadastro do app autenticador e cria a sessão. */
export function POST(request: Request) {
  return handleCodeStep(request, "enroll");
}
