export type TipoBloco = 'paragrafo' | 'lista' | 'destaque';

export interface ConteudoBlock {
  tipo: TipoBloco;
  texto?: string;
  itens?: string[];
}

export interface SubSecao {
  titulo: string;
  conteudo: ConteudoBlock[];
}

export interface Termo {
  titulo: string;
  conteudoGeral?: ConteudoBlock[];
  subsecoes?: SubSecao[];
}

export const TERMS_DATA: Termo[] = [
  {
    titulo: "1. Finalidade do site",
    conteudoGeral: [
      {
        tipo: "paragrafo",
        texto: "O site da TECFY possui caráter institucional e informativo, tendo como principais finalidades:",
      },
      {
        tipo: "lista",
        itens: [
          "Apresentar os serviços, produtos e soluções tecnológicas oferecidas pela empresa;",
          "Facilitar o contato comercial e o envio de solicitações por parte de clientes, parceiros e interessados;",
          "Disponibilizar conteúdos informativos, materiais técnicos e institucionais relacionados às atividades da TECFY."
        ]
      },
      {
        tipo: "paragrafo",
        texto: "O acesso e a navegação no site não criam qualquer vínculo contratual, societário ou de prestação de serviços entre o visitante e a TECFY.",
      },
      {
        tipo: "paragrafo",
        texto: "Toda e qualquer contratação de serviços será formalizada exclusivamente mediante instrumento contratual próprio, firmado entre as partes e com condições específicas previamente acordadas.",
      }
    ]
  },
  {
    titulo: "2. Acesso e uso do site",
    conteudoGeral: [
      {
        tipo: "paragrafo",
        texto: "O acesso ao site da TECFY é livre e gratuito, podendo ser temporariamente suspenso ou limitado em razão de manutenção, atualização, instabilidade técnica ou motivos de força maior.",
      },
      {
        tipo: "paragrafo",
        texto: "Ao utilizar o site, o usuário declara estar ciente e compromete-se a:",
      },
      {
        tipo: "lista",
        itens: [
          "Fornecer informações verdadeiras, completas e atualizadas nos formulários de contato e demais campos interativos;",
          "Abster-se de utilizar o site para quaisquer fins ilegais, ofensivos, difamatórios, abusivos, fraudulentos ou que violem direitos de terceiros;",
          "Não inserir, transmitir ou propagar vírus, códigos maliciosos, arquivos corrompidos ou qualquer conteúdo que possa comprometer a segurança, integridade ou desempenho da plataforma;",
          "Respeitar os direitos de propriedade intelectual da TECFY e de terceiros, conforme previsto na legislação vigente."
        ]
      },
      {
        tipo: "paragrafo",
        texto: "A Tecfy reserva-se o direito de, a seu exclusivo critério, restringir, suspender ou encerrar o acesso de qualquer usuário que viole estes Termos de Uso, sem prejuízo das medidas legais cabíveis."
      }
    ]
  },
  {
    titulo: "3. Propriedade intelectual",
    conteudoGeral: [
      {
        tipo: "paragrafo",
        texto: "Todo o conteúdo disponibilizado no site da Tecfy, incluindo, mas não se limitando a, textos, descrições técnicas, imagens, fotografias, vídeos, logotipos, ícones, ilustrações, gráficos, códigos-fonte, layouts, interfaces, animações, documentos, apresentações, marcas registradas, slogans, designs e materiais publicitários, constitui propriedade intelectual exclusiva da Tecfy Tecnologia e Software LTDA ou de seus licenciadores, estando protegido pelas leis brasileiras e tratados internacionais aplicáveis, especialmente a Lei nº 9.610/1998 (Lei de Direitos Autorais) e a Lei nº 9.279/1996 (Lei de Propriedade Industrial).",
      },
      {
        tipo: "paragrafo",
        texto: "A utilização do site não concede ao usuário qualquer licença ou autorização, expressa ou implícita, para uso, reprodução, modificação ou exploração de qualquer conteúdo pertencente à Tecfy.",
      },
      {
        tipo: "paragrafo",
        texto: "É estritamente proibido, sob qualquer forma ou meio, total ou parcialmente:"
      },
      {
        tipo: "lista",
        itens: [
          "Copiar, reproduzir, republicar, redistribuir, transmitir, adaptar, traduzir, modificar, exibir publicamente ou criar obras derivadas do conteúdo do site;",
          "Utilizar textos, descrições, códigos, designs ou ideias desenvolvidas pela Tecfy, ainda que com pequenas alterações, para fins próprios, comerciais ou concorrenciais;",
          "Utilizar marcas, nomes comerciais, logotipos ou quaisquer sinais distintivos da Tecfy sem autorização prévia e por escrito.",
        ]
      },
      {
        tipo: "paragrafo",
        texto: "Qualquer uso indevido do conteúdo da Tecfy poderá ensejar responsabilização civil e criminal, incluindo medidas judiciais para indenização por danos materiais e morais, retirada imediata do conteúdo copiado, e aplicação das penalidades previstas na legislação brasileira.",
      },
      {
        tipo: "paragrafo",
        texto: "A Tecfy reserva-se o direito de monitorar o uso indevido de seus materiais e adotar todas as medidas legais cabíveis para proteger sua propriedade intelectual e sua reputação no mercado.",
      }
    ]
  },
  {
    titulo: "4. Conteúdo de terceiros e links externos",
    conteudoGeral: [
      {
        tipo: "paragrafo",
        texto: "O site da Tecfy pode conter links, integrações, widgets ou redirecionamentos para plataformas, serviços e conteúdos de terceiros, tais como Google, LinkedIn, Meta, GitHub, YouTube, entre outros."
      },
      {
        tipo: "paragrafo",
        texto: "Esses links são disponibilizados exclusivamente para conveniência e melhor experiência do usuário, não representando qualquer tipo de apoio, endosso, parceria comercial, garantia de veracidade ou responsabilidade da Tecfy sobre o conteúdo, produtos, serviços ou práticas adotadas por terceiros."
      },
      {
        tipo: "paragrafo",
        texto: "A Tecfy não controla, revisa, monitora nem garante a exatidão, segurança ou conformidade das informações apresentadas nesses sites externos, tampouco se responsabiliza por danos, perdas, incidentes de segurança, coleta indevida de dados pessoais ou prejuízos que possam decorrer do acesso, uso ou confiança em tais conteúdos.",
      },
      {
        tipo: "paragrafo",
        texto: "O acesso a sites de terceiros é de inteira responsabilidade do usuário, que deve verificar cuidadosamente os Termos de Uso, Políticas de Privacidade e demais condições aplicáveis antes de utilizar ou fornecer qualquer informação a esses serviços.",
      },
      {
        tipo: "paragrafo",
        texto: "Caso o usuário identifique links ou conteúdos externos inadequados, ofensivos ou suspeitos, poderá comunicar a Tecfy para avaliação e possível remoção do link do nosso site.",
      }
    ]
  },
  {
    titulo: "5. Limitação de responsabilidade",
    conteudoGeral: [
      {
        tipo: "paragrafo",
        texto: "A Tecfy adota todas as medidas razoáveis e boas práticas de segurança, tecnologia e atualização para manter o site disponível, estável e protegido. No entanto, não garante que o funcionamento do site será ininterrupto, livre de erros, falhas técnicas, vulnerabilidades, vírus, ataques cibernéticos ou outros eventos fora de seu controle.",
      },
      {
        tipo: "paragrafo",
        texto: "Em nenhuma hipótese a Tecfy, seus sócios, colaboradores, parceiros ou fornecedores serão responsáveis, de forma direta ou indireta, por quaisquer danos, perdas, prejuízos ou lucros cessantes decorrentes de:"
      },
      {
        tipo: "lista",
        itens: [
          "Mau funcionamento, indisponibilidade ou uso inadequado do site ou de suas funcionalidades;",
          "Ações, omissões ou condutas de terceiros, incluindo ataques, invasões, interceptações ou vazamentos de dados;",
          "Uso indevido de informações, textos, imagens ou materiais obtidos por meio do site;",
          "Conteúdos, integrações ou links de terceiros acessados por meio do site;",
          "Erros de digitação, imprecisões técnicas, desatualizações ou eventuais falhas humanas no conteúdo disponibilizado."
        ]
      },
      {
        tipo: "paragrafo",
        texto: "O uso do site é de inteira responsabilidade do usuário, que concorda em fazê-lo por conta e risco próprios, reconhecendo que a Tecfy não se responsabiliza por qualquer consequência decorrente da utilização das informações ou serviços aqui apresentados."
      }
    ]
  },
  {
    titulo: "6. Política de Privacidade",
    conteudoGeral: [
      {
        tipo: "paragrafo",
        texto: "O tratamento de dados pessoais coletados por meio deste site é regido pela nossa Política de Privacidade, que detalha as práticas de coleta, uso, armazenamento e proteção de informações.",
      },
      {
        tipo: "paragrafo",
        texto: "Recomendamos a leitura atenta da Política de Privacidade antes de fornecer qualquer dado pessoal."
      }
    ]
  },
  {
    titulo: "7. Alteração dos Termos de Uso",
    conteudoGeral: [
      {
        tipo: "paragrafo",
        texto: "A Tecfy poderá atualizar estes Termos de Uso periodicamente, para refletir mudanças legais, regulatórias, tecnológicas ou operacionais."
      },
      {
        tipo: "paragrafo",
        texto: "Sempre que houver atualização, a nova versão será publicada nesta página, com a data de última modificação claramente indicada."
      },
      {
        tipo: "paragrafo",
        texto: "Recomendamos que você revise estes Termos regularmente. O uso contínuo dos nossos serviços após a publicação das alterações representará a sua concordância com os novos termos."
      }
    ]
  },
  {
    titulo: "8. Legislação aplicável e foro",
    conteudoGeral: [
      {
        tipo: "paragrafo",
        texto: "Estes Termos de Uso são regidos e interpretados de acordo com as leis da República Federativa do Brasil, especialmente com base na Lei nº 12.965/2014 (Marco Civil da Internet), na Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais – LGPD) e demais normas pertinentes do ordenamento jurídico brasileiro.",
      },
      {
        tipo: "paragrafo",
        texto: "Ao utilizar o site da Tecfy Tecnologia e Software LTDA, o usuário concorda que qualquer dúvida, controvérsia ou disputa decorrente da interpretação ou execução destes Termos será resolvida de forma preferencialmente amigável, por meio de comunicação direta entre as partes.",
      },
      {
        tipo: "paragrafo",
        texto: "Não sendo possível a solução consensual, fica eleito o foro da Comarca de Osasco, Estado de São Paulo, com renúncia expressa a qualquer outro foro, por mais privilegiado que seja, para dirimir eventuais conflitos relacionados a este documento ou ao uso do site.",
      }
    ]
  },
  {
    titulo: "9. Contato",
    conteudoGeral: [
      {
        tipo: "paragrafo",
        texto: "Se você tiver dúvidas, solicitações, reclamações ou desejar exercer seus direitos previstos na LGPD, entre em contato com o nosso Encarregado de Proteção de Dados (DPO) pelos canais abaixo:",
      },
      {
        tipo: "lista",
        itens: [
          "E-mail: contato@tecfy.com.br",
          "Site: www.tecfy.dev",
          "Razão social: Tecfy Tecnologia e Software LTDA",
          "CNPJ: 62.620.086/0001-02",
          "Endereço: Avenida Presidente Médici, 117, Sala 2, Jardim Baronesa, Osasco. SP"
        ]
      }
    ]
  }
];