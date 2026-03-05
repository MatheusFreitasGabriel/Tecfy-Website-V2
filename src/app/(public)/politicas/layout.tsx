import Link from 'next/link'

export default function PoliticasLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 flex gap-12">
      
      {/* Sidebar */}
      <aside className="w-64 shrink-0">
        <nav className="flex flex-col gap-3 text-sm">
          <Link href="/politicas/privacidade">Privacidade</Link>
          <Link href="/politicas/cookies">Cookies</Link>
          <Link href="/politicas/termos">Termos de Uso</Link>
        </nav>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 prose prose-neutral max-w-none">
        {children}
      </main>
    </div>
  )
}
