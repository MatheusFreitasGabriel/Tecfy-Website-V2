import Link from "next/link";

export default function NotFound() {
  return (
    <section className="w-full min-h-screen flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="text-secondary text-base uppercase">Erro 404</span>
        <h1 className="text-6xl md:text-8xl font-semibold text-text-primary uppercase leading-none">
          Página não encontrada
        </h1>
        <p className="text-base text-text-secondary uppercase max-w-[540px]">
          O endereço que você tentou acessar não existe ou foi movido.
        </p>
        <Link
          href="/"
          className="mt-4 h-12 md:h-[56px] px-10 flex items-center justify-center uppercase font-semibold bg-white text-black hover:bg-gray-200 transition-colors"
        >
          Voltar para o início
        </Link>
      </div>
    </section>
  );
}
