/**
 * Esqueletos de carregamento: aparecem NA HORA ao navegar (loading.tsx), com o formato da tela,
 * enquanto o servidor busca os dados. Sem animação para quem prefere menos movimento.
 */
const block = "rounded-lg bg-admin-card motion-safe:animate-pulse";

function Header({ withButton = true }: { withButton?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-3">
        <div className={`${block} h-9 w-56`} />
        <div className={`${block} h-4 w-80 max-w-full`} />
      </div>
      {withButton && <div className={`${block} h-11 w-36`} />}
    </div>
  );
}

/** Lista com busca, filtros e tabela (Leads, Contatos, Empresas). */
export function ListSkeleton({ filters = 3, label }: { filters?: number; label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen w-full flex-col gap-8 p-8">
      <span className="sr-only">Carregando {label}...</span>
      <Header />
      <div className="flex flex-col gap-[18px]">
        <div className={`${block} h-11 w-full`} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: filters }, (_, i) => (
            <div key={i} className={`${block} h-11`} />
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-xl outline outline-1 -outline-offset-1 outline-admin-table-border">
        <div className="h-11 bg-admin-table-head" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`flex h-[60px] items-center gap-6 border-b border-admin-table-divider px-6 ${i % 2 ? "bg-admin-table-alt" : "bg-admin-table"}`}>
            <div className="flex flex-1 flex-col gap-2">
              <div className={`${block} h-3.5 w-48`} />
              <div className={`${block} h-3 w-28`} />
            </div>
            <div className={`${block} hidden h-3.5 w-40 md:block`} />
            <div className={`${block} hidden h-3.5 w-32 lg:block`} />
            <div className={`${block} h-7 w-20`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Página de detalhe (contato/empresa): cabeçalho + cartões + coluna lateral. */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen w-full flex-col gap-6 p-8">
      <span className="sr-only">Carregando {label}...</span>
      <div className={`${block} h-4 w-24`} />
      <div className="flex items-center gap-5">
        <div className={`${block} h-16 w-16 rounded-full`} />
        <div className="flex flex-col gap-3">
          <div className={`${block} h-8 w-64`} />
          <div className={`${block} h-4 w-48`} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          {[180, 140, 220].map((h, i) => (
            <div key={i} className={`${block} w-full`} style={{ height: h }} />
          ))}
        </div>
        <div className="flex flex-col gap-6">
          <div className={`${block} h-64 w-full`} />
          <div className={`${block} h-32 w-full`} />
        </div>
      </div>
    </div>
  );
}
