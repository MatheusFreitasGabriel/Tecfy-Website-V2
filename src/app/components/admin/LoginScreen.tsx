"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import TurnstileWidget, { type TurnstileWidgetHandle } from "@/app/components/public/contato/TurnstileWidget";
import { validateEmail } from "@/shemas/validationSchema";

type Step = "credentials" | "mfa" | "enroll";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email ou senha inválidos.",
  invalid_code: "Código inválido. Confira o app autenticador e tente de novo.",
  expired: "Sua tentativa de login expirou. Entre novamente.",
  too_many_requests: "Muitas tentativas. Tente novamente mais tarde.",
  turnstile_failed: "Não foi possível confirmar que você é humano. Tente novamente.",
  invalid_input: "Confira os dados informados.",
  unavailable: "Não foi possível entrar agora. Tente novamente em instantes.",
};

const labelClass = "self-stretch text-[20px] font-semibold uppercase leading-5 text-text-primary";
const inputClass =
  "w-full bg-background-input border border-border-input px-2.5 py-5 text-base font-medium leading-4 text-text-primary placeholder:text-text-placeholder outline-none transition-colors focus:border-text-secondary";
const buttonClass =
  "flex h-14 w-full items-center justify-center bg-white p-2.5 text-base font-semibold uppercase leading-4 text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";

interface LoginScreenProps {
  basePath: string;
}

export default function LoginScreen({ basePath }: LoginScreenProps) {
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [enrollData, setEnrollData] = useState<{ qr: string; secret: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const onTokenChange = useCallback((token: string | null) => setTurnstileToken(token), []);

  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`${basePath}/api/session${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, data };
  };

  const backToCredentials = (message: string | null) => {
    setStep("credentials");
    setCode("");
    setPassword("");
    setEnrollData(null);
    setError(message);
  };

  const enterSystem = () => {
    // Navegação completa para o servidor ler o cookie de sessão recém-criado.
    window.location.replace(basePath);
  };

  const handleCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setNotice(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!validateEmail(normalizedEmail) || password.length === 0) {
      setError(MESSAGES.invalid_input);
      return;
    }
    if (!turnstileToken) {
      setError("Aguarde a verificação anti-robô.");
      return;
    }

    setLoading(true);
    try {
      const { ok, data } = await post("", { email: normalizedEmail, password, turnstile_token: turnstileToken });
      if (ok && data.step === "mfa") {
        setStep("mfa");
      } else if (ok && data.step === "enroll" && typeof data.qr === "string" && typeof data.secret === "string") {
        setEnrollData({ qr: data.qr, secret: data.secret });
        setStep("enroll");
      } else {
        setError(MESSAGES[String(data.error)] ?? MESSAGES.unavailable);
      }
    } catch {
      setError(MESSAGES.unavailable);
    } finally {
      // Token do Turnstile é de uso único.
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      setPassword("");
      setLoading(false);
    }
  };

  const handleCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Digite os 6 dígitos do app autenticador.");
      return;
    }

    setLoading(true);
    try {
      const { ok, data } = await post(step === "enroll" ? "/enroll" : "/mfa", { code });
      if (ok && data.ok === true) {
        enterSystem();
        return;
      }
      if (ok && data.step === "relogin") {
        backToCredentials(null);
        setNotice("Verificação em 2 etapas ativada. Entre novamente para acessar.");
        return;
      }
      const errorCode = String(data.error);
      if (errorCode === "expired" || errorCode === "too_many_requests") {
        backToCredentials(MESSAGES[errorCode]);
        return;
      }
      setCode("");
      setError(MESSAGES[errorCode] ?? MESSAGES.unavailable);
    } catch {
      setError(MESSAGES.unavailable);
    } finally {
      setLoading(false);
    }
  };

  const title = step === "credentials" ? "Entre no nosso sistema" : step === "mfa" ? "Verificação em 2 etapas" : "Ative a verificação em 2 etapas";

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-8">
      <h1 className="text-center text-[28px] font-semibold uppercase leading-none text-text-primary sm:text-[32px]">{title}</h1>

      {step === "credentials" ? (
        <form onSubmit={handleCredentials} noValidate className="flex w-full flex-col gap-6 border border-border-card p-6 sm:p-9">
          <div className="flex flex-col gap-3">
            <label htmlFor="admin-email" className={labelClass}>
              Email
            </label>
            <input
              id="admin-email"
              name="username"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              required
              placeholder="johndoe@tecfy.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="admin-password" className={labelClass}>
              Senha
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              required
              placeholder="*******"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          <TurnstileWidget ref={turnstileRef} onTokenChange={onTokenChange} action="admin_login" />

          <Feedback error={error} notice={notice} />

          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleCode} noValidate className="flex w-full flex-col gap-6 border border-border-card p-6 sm:p-9">
          {step === "enroll" && enrollData && (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-sm text-text-secondary">
                Escaneie o QR code com um app autenticador (Google Authenticator, Authy, 1Password…) e digite o código
                gerado.
              </p>
              <Image src={enrollData.qr} alt="QR code do autenticador" width={220} height={220} unoptimized className="bg-white" />
              <div className="flex w-full flex-col gap-1">
                <span className="text-xs uppercase text-text-tertiary">Ou digite a chave manualmente</span>
                <code className="break-all bg-background-input px-2.5 py-2 text-sm text-text-primary select-all">{enrollData.secret}</code>
              </div>
            </div>
          )}

          {step === "mfa" && (
            <p className="text-sm text-text-secondary">Abra seu app autenticador e digite o código de 6 dígitos.</p>
          )}

          <div className="flex flex-col gap-3">
            <label htmlFor="admin-code" className={labelClass}>
              Código
            </label>
            <input
              id="admin-code"
              name="one-time-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              required
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`${inputClass} tracking-[0.5em]`}
            />
          </div>

          <Feedback error={error} notice={null} />

          <button type="submit" disabled={loading} className={buttonClass}>
            {loading ? "Verificando..." : step === "enroll" ? "Ativar e entrar" : "Confirmar"}
          </button>

          <button
            type="button"
            onClick={() => backToCredentials(null)}
            className="self-center text-sm uppercase text-text-secondary underline-offset-4 hover:text-text-primary hover:underline cursor-pointer"
          >
            Voltar
          </button>
        </form>
      )}
    </div>
  );
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (!error && !notice) return null;
  return (
    <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-red-400" : "text-text-secondary"}`}>
      {error ?? notice}
    </p>
  );
}
