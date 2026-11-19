import { FaCircleNotch } from "react-icons/fa6";

/**
 * Carregamento das telas do painel (a sidebar continua visível; só o conteúdo espera).
 * Provisório: depois vira skeleton loading específico de cada tela.
 */
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen w-full items-center justify-center">
      <FaCircleNotch aria-hidden className="h-8 w-8 animate-spin text-text-muted motion-reduce:animate-none" />
      <span className="sr-only">Carregando...</span>
    </div>
  );
}
