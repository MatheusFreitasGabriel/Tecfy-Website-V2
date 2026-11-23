/** Esqueleto da tela Produtos: cabeçalho, 5 indicadores, filtros e grade de cards. */
export default function Loading() {
  const block = "animate-pulse rounded-2xl bg-admin-card";
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen w-full flex-col gap-8 p-8">
      <span className="sr-only">Carregando produtos...</span>
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-6">
          <div className={`${block} h-4 w-28`} />
          <div className={`${block} h-8 w-72`} />
        </div>
        <div className={`${block} h-11 w-40 rounded-lg`} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`${block} h-[112px] rounded-xl`} />
        ))}
      </div>
      <div className="flex justify-between gap-4">
        <div className={`${block} h-11 w-[380px] max-w-full`} />
        <div className={`${block} h-11 w-[360px]`} />
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${block} h-[360px]`} />
        ))}
      </div>
    </div>
  );
}
