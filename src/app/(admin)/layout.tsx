import React from 'react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 text-gray-800">
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold">Modificações no futuro</h1>
        <p className="mt-2 text-sm text-gray-500">
          Painel de controle em desenvolvimento.
        </p>
      </div>
      
      {/* O conteúdo da sua page.tsx do admin será renderizado aqui abaixo (ou ocultado enquanto você não desenvolve) */}
      <main className="mt-8 w-full max-w-4xl opacity-50 grayscale">
        {children}
      </main>
    </div>
  );
}