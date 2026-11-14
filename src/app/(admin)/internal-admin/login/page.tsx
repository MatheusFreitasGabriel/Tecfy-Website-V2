import Image from "next/image";
import { redirect } from "next/navigation";
import LoginScreen from "@/app/components/admin/LoginScreen";
import { getAdminBasePath } from "@/lib/adminPath";
import { getAdminSession } from "@/lib/admin/session";

export const metadata = { title: "Acesso | Tecfy" };

export default async function AdminLoginPage() {
  const basePath = getAdminBasePath() ?? "";
  if (await getAdminSession()) redirect(basePath);

  return (
    <div className="grid min-h-screen w-full bg-background lg:h-screen lg:grid-cols-2">
      {/* Esquerda: logo, formulário e aviso legal */}
      <section className="flex min-h-screen flex-col overflow-y-auto px-6 py-8 lg:min-h-0 lg:px-14">
        <Image src="/assets/visual-identity/logo-tecfy.svg" alt="Tecfy" width={91} height={24} priority />

        <div className="mt-9 flex w-full justify-center lg:mt-[100px]">
          <LoginScreen basePath={basePath} />
        </div>

        <p className="mt-auto pt-10 text-xs font-normal leading-3 text-text-placeholder">
          {"// ATENÇÃO: O acesso a esta plataforma é exclusivo para colaboradores autorizados. Qualquer tentativa de acesso não autorizada ou sem justificativa plausível resultará no bloqueio imediato de contas e credenciais vinculadas, além de estar sujeita às penalidades legais e processos judiciais cabíveis."}
          <br />
          <br />
          Segurança e Auditoria: Para fins de controle, segurança e conformidade, o seu endereço de IP, localização e
          dados de navegação estão sendo registrados. Qualquer envio de dados ou tentativa de invasão será reportado às
          autoridades competentes com os devidos logs de auditoria.
        </p>
      </section>

      {/* Direita: imagem (metade da tela, altura total) — só no desktop */}
      <div className="relative hidden h-screen lg:block">
        <Image src="/assets/images/cta-background.webp" alt="" fill priority sizes="50vw" className="object-cover" />
      </div>
    </div>
  );
}
