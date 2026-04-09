'use client';

import { CONTACT_THANKS_SESSION_KEY } from "@/lib/contactThanksSession";
import { getCalApi } from "@calcom/embed-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ThanksSession = { lead_name: string; lead_email: string };

function parseThanksSession(raw: string | null): ThanksSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<ThanksSession>;
    const name = typeof data.lead_name === "string" ? data.lead_name.trim() : "";
    const email = typeof data.lead_email === "string" ? data.lead_email.trim() : "";
    if (!name || !email) return null;
    return { lead_name: name, lead_email: email };
  } catch {
    return null;
  }
}

export default function Thanks() {
  const router = useRouter();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");

  const calConfigJson = useMemo(
    () =>
      JSON.stringify({
        layout: "month_view",
        theme: "dark",
        name: leadName,
        email: leadEmail,
      }),
    [leadName, leadEmail]
  );

  useEffect(() => {
    const session = parseThanksSession(sessionStorage.getItem(CONTACT_THANKS_SESSION_KEY));
    if (!session) {
      router.replace("/contato");
      setAccess("denied");
      return;
    }
    setLeadName(session.lead_name);
    setLeadEmail(session.lead_email);
    setAccess("allowed");
  }, [router]);

  useEffect(() => {
    if (access !== "allowed") return;
    (async function () {
      const cal = await getCalApi({ namespace: "30min" });
      cal("ui", {
        theme: "dark",
        styles: {
          branding: {
            brandColor: "#000000",
          },
        },
        hideEventTypeDetails: false,
        layout: "month_view",
      });
    })();
  }, [access]);

  if (access === "checking" || access === "denied") {
    return (
      <section className="w-full min-h-screen flex items-center justify-center bg-black text-white">
        <p className="text-sm uppercase tracking-wide text-gray-400">Carregando…</p>
      </section>
    );
  }

  return (
    <section className="w-full h-screen flex items-center justify-center bg-black text-white">
      <div className="max-w-[1440px] flex flex-col px-6 gap-12">
        <div className="flex flex-col items-center justify-center gap-6">
          <h1 className="uppercase text-6xl md:text-8xl font-semibold text-center leading-none">
            Obrigado por<br />escolher a tecfy!
          </h1>
          <p className="uppercase text-base font-normal max-w-[648px] text-center text-gray-400">
            Nossa equipe entrará em contato com você logo, logo; ou, se preferir, já pode ir marcando um horário para uma reunião.
          </p>
        </div>

        <div className="w-full flex flex-col items-center justify-center gap-4">
          <button
            type="button"
            data-cal-namespace="30min"
            data-cal-link="tecfydev/briefing-sem-modestia"
            data-cal-config={calConfigJson}
            className="w-full max-w-[648px] h-12 md:h-[56px] uppercase font-semibold transition-all duration-300 bg-white text-black hover:bg-gray-200 cursor-pointer"
          >
            Já agendar reunião
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = "/";
            }}
            className="w-full max-w-[648px] h-12 md:h-[56px] uppercase font-semibold transition-all duration-300 bg-black text-white border border-white hover:bg-zinc-900 cursor-pointer"
          >
            Voltar para a tela inicial
          </button>
        </div>
      </div>
    </section>
  );
}