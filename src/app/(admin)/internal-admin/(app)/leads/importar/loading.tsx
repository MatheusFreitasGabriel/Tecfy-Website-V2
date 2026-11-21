/** Esqueleto da tela Importar lista (topo + área de envio + modelo/histórico). */
export default function Loading() {
  const block = "animate-pulse rounded-2xl bg-admin-card";
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen w-full flex-col gap-8 p-8">
      <span className="sr-only">Carregando importação...</span>
      <div className="flex flex-col gap-5">
        <div className={`${block} h-4 w-16`} />
        <div className={`${block} h-[38px] w-64`} />
        <div className={`${block} h-4 w-96 max-w-full`} />
      </div>
      <div className={`${block} h-[260px] w-full`} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className={`${block} h-[300px]`} />
        <div className={`${block} h-[300px]`} />
      </div>
    </div>
  );
}
