/**
 * Esqueletos de carregamento: aparecem NA HORA ao navegar (loading.tsx), com o formato da tela,
 * enquanto o servidor busca os dados. Sem animação para quem prefere menos movimento.
 */
const block = "rounded-lg bg-admin-card motion-safe:animate-pulse";
/** Botões principais (roxos) no esqueleto. */
const primaryBlock = "rounded-lg bg-admin-primary/30 motion-safe:animate-pulse";

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

/** Tela de Leads: mesmo layout da tela real (topo, barra de ferramentas, filtros, tabela e paginação). */
export function LeadsSkeleton() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen w-full flex-col gap-8 p-8">
      <span className="sr-only">Carregando leads...</span>

      {/* Topo: título + contador + Importar / Criar lead */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-4">
            <div className={`${block} h-9 w-28`} />
            <div className={`${block} h-7 w-[38px]`} />
          </div>
          <div className={`${block} h-4 w-96 max-w-full`} />
        </div>
        <div className="flex gap-4">
          <div className={`${block} h-11 w-[142px]`} />
          <div className={`${primaryBlock} h-11 w-[140px]`} />
        </div>
      </div>

      {/* Busca + Filtros / Exportar / Modelos / Atualizar */}
      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className={`${block} h-11 flex-1`} />
          <div className="flex gap-3">
            <div className={`${block} h-11 w-40`} />
            <div className={`${block} h-11 w-28`} />
            <div className={`${block} h-11 w-28`} />
            <div className={`${block} h-11 w-11`} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className={`${block} h-3 w-20`} />
              <div className={`${block} h-11`} />
            </div>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl outline outline-1 -outline-offset-1 outline-admin-table-border">
        <div className="flex h-11 items-center gap-6 bg-admin-table-head px-6">
          <div className={`${block} h-4 w-4`} />
          <div className={`${block} h-3 w-28`} />
          <div className={`${block} ml-auto hidden h-3 w-20 md:block`} />
          <div className={`${block} hidden h-3 w-16 md:block`} />
          <div className={`${block} hidden h-3 w-20 lg:block`} />
          <div className={`${block} h-3 w-12`} />
        </div>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={`flex h-[60px] items-center gap-6 border-b border-admin-table-divider px-6 ${i % 2 ? "bg-admin-table-alt" : "bg-admin-table"}`}>
            <div className={`${block} h-4 w-4 shrink-0`} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className={`${block} h-3.5`} style={{ width: `${45 + ((i * 37) % 40)}%`, maxWidth: 260 }} />
              <div className={`${block} h-3 w-24`} />
            </div>
            <div className={`${block} hidden h-7 w-[86px] rounded-[7px] md:block`} />
            <div className={`${block} hidden h-3.5 w-32 md:block`} />
            <div className={`${block} hidden h-3.5 w-20 lg:block`} />
            <div className={`${block} h-5 w-5 rounded-full`} />
            <div className="flex gap-1">
              <div className={`${block} h-9 w-9`} />
              <div className={`${block} h-9 w-9`} />
            </div>
          </div>
        ))}
        {/* Paginação */}
        <div className="flex items-center justify-between gap-4 border-t border-admin-table-border bg-admin-table-alt px-6 py-4">
          <div className={`${block} h-4 w-44`} />
          <div className="flex gap-3">
            <div className={`${block} h-[34px] w-[116px]`} />
            <div className={`${primaryBlock} h-[38px] w-10`} />
            <div className={`${block} h-[34px] w-[116px]`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Lista de itens do histórico enquanto carrega (painel do lead / timelines). */
export function TimelineSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div role="status" aria-live="polite" className="relative flex flex-col gap-5 border-l border-admin-card-border pl-5">
      <span className="sr-only">Carregando histórico...</span>
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className="relative flex flex-col gap-2">
          <span aria-hidden className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-admin-card ring-4 ring-background-kpi" />
          <div className={`${block} h-3 w-48`} />
          <div className={`${block} h-3.5`} style={{ width: `${90 - i * 18}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Cartões de e-mails enviados enquanto carrega. */
export function CardListSkeleton({ items = 2 }: { items?: number }) {
  return (
    <div role="status" aria-live="polite" className="mt-3 flex flex-col gap-2">
      <span className="sr-only">Carregando...</span>
      {Array.from({ length: items }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg bg-admin-drawer-card px-4 py-3 outline outline-1 -outline-offset-1 outline-admin-card-border">
          <div className={`${block} h-3.5 w-3/5`} />
          <div className={`${block} h-3 w-4/5`} />
        </div>
      ))}
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
