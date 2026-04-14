import React from 'react';

import { TERMS_DATA, ConteudoBlock } from './types';

const PoliticasCookies = () => {
  const titleSection = 'Política de Cookies';
  const lastUpdateDate = '14 de Abr, 2026';

  const generateId = (text: string): string => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ /g, '-')
      .replace(/[^\w-]+/g, '');
  };

  return (
    <main className="w-full flex flex-col items-center gap-6">
      <header className="w-full max-w-[1440px] px-6 mx-auto flex flex-col gap-3">
        <h1 className="text-2xl md:text-4xl font-medium text-white leading-tight">
          {titleSection}
        </h1>
        <p className="text-base text-gray-400">
          <small>Última atualização em <time>{lastUpdateDate}</time>.</small>
        </p>
      </header>

      <nav className="w-full max-w-[1440px] mx-auto p-6 bg-[#080808] border border-white/10 rounded-xl flex flex-col gap-6" aria-label="Índice de Conteúdo">
        <p className="text-base text-white font-medium m-0">Conteúdo</p>
        <ul className="flex flex-col gap-3 list-none p-0 m-0">
          {TERMS_DATA.map((term, index) => (
            <li key={index}>
              <a
                href={`#${generateId(term.titulo)}`}
                className="text-white text-base no-underline hover:text-gray-400 hover:underline transition-colors duration-300 block"
              >
                {term.titulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <article className="w-full max-w-[1440px] px-6 flex flex-col gap-16">
        {TERMS_DATA.map((term, index) => (
          <section
            key={index}
            id={generateId(term.titulo)}
            className="flex flex-col gap-6 scroll-mt-[140px]"
          >
            <h2 className="text-xl md:text-[28px] font-medium text-white m-0">
              {term.titulo}
            </h2>

            {term.conteudoGeral && (
              <ContentRenderer blocos={term.conteudoGeral} />
            )}

            {term.subsecoes && (
              <ol className="list-[upper-alpha] pl-6 mt-3 space-y-8">
                {term.subsecoes.map((sub, subIdx) => (
                  <li key={subIdx}>
                    <h3 className="block mb-4 text-lg font-bold text-white">
                      {sub.titulo}
                    </h3>
                    <ContentRenderer blocos={sub.conteudo} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </article>
    </main>
  );
};

const ContentRenderer = ({ blocos }: { blocos: ConteudoBlock[] }) => {
  return (
    <>
      {blocos.map((bloco, index) => {
        if (bloco.tipo === 'paragrafo') {
          return (
            <p key={index} className="pb-[6px] mb-3 text-base leading-relaxed text-white">
              {bloco.texto}
            </p>
          );
        }

        if (bloco.tipo === 'lista') {
          return (
            <ul key={index} className="pl-6 mb-4 list-disc text-gray-400">
              {bloco.itens?.map((item, itemIdx) => (
                <li key={itemIdx} className="mb-2 text-white pl-1">
                  {item}
                </li>
              ))}
            </ul>
          );
        }

        if (bloco.tipo === 'destaque') {
          return (
            <blockquote
              key={index}
              className="flex flex-col border-l-4 border-blue-500 bg-white/5 p-4 my-4 rounded-r-lg text-gray-400 font-medium italic"
            >
              <p className="m-0 p-0">{bloco.texto}</p>
            </blockquote>
          );
        }

        return null;
      })}
    </>
  );
};

export default PoliticasCookies;