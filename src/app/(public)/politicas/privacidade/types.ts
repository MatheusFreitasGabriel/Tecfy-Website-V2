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
        titulo: 'Introdução',
        conteudoGeral: [
          {
            tipo: 'paragrafo',
            texto: 'A Tecfy Tecnologia e Software LTDA (“Tecfy”, “nós” ou “nosso”) valoriza e respeita a sua privacidade. Esta Política de Privacidade descreve, de forma clara e transparente, como realizamos a coleta, uso, armazenamento, compartilhamento e proteção de dados pessoais quando você utiliza nossos sites, aplicativos, sistemas, plataformas, APIs, documentação, formulários de contato e demais recursos tecnológicos (em conjunto, o “Serviço”).'
          },
          {
            tipo: 'paragrafo',
            texto: 'Ao acessar ou utilizar o Serviço, você reconhece e concorda com o tratamento de seus dados pessoais conforme as práticas descritas nesta Política. Esta Política aplica-se exclusivamente às situações em que a TECFY atua como controladora de dados pessoais, definindo as finalidades e os meios de tratamento.'
          },
          {
            tipo: 'destaque', // Aquele box azul
            texto: 'Nos casos em que a TECFY atua como operadora — processando dados em nome de clientes corporativos ou parceiros — o tratamento é regido pelos contratos e políticas específicas firmados com esses clientes.'
          }
        ]
      },
      {
        titulo: '1. Dados pessoais que coletamos',
        subsecoes: [
          {
            titulo: 'Dados fornecidos diretamente por você',
            conteudo: [
              {
                tipo: 'paragrafo',
                texto: 'Coletamos apenas as informações que você nos fornece voluntariamente por meio de nossos formulários de contato, incluindo:'
              },
              {tipo: 'lista', itens: ['Nome completo', 'Endereço de e-mail', 'Número de telefone']},
              {
                tipo: 'paragrafo',
                texto: 'Esses dados são utilizados exclusivamente para entrar em contato com você, responder solicitações e dar continuidade ao atendimento comercial.'
              },
              {
                tipo: 'paragrafo',
                texto: 'Em etapas posteriores do relacionamento, e mediante o seu consentimento expresso, poderemos coletar informações adicionais necessárias para a execução de serviços, propostas ou contratos, como:'
              },
              {
                tipo: 'lista',
                itens: ['Idade', 'Sexo', 'CPF ou CNPJ', 'Cargo e empresa', 'Endereço', 'Outros dados relevantes ao projeto ou à relação comercial']
              },
              {
                tipo: 'paragrafo',
                texto: 'Todos esses dados serão coletados e tratados de forma transparente, segura e limitada às finalidades específicas informadas no momento da coleta, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018).'
              }
            ]
          },
          {
            titulo: 'Dados coletados automaticamente',
            conteudo: [
              {
                tipo: 'paragrafo',
                texto: 'Ao acessar nossos sites, plataformas ou sistemas, alguns dados podem ser coletados automaticamente, de forma a garantir o funcionamento seguro e otimizado do Serviço. Esses dados incluem:'
              },
              {
                tipo: 'lista', itens: [
                  'Endereço IP e localização aproximada, obtidos para fins de segurança, estatísticas de acesso e prevenção de atividades suspeitas;',
                  'Informações do dispositivo e do navegador, como tipo, versão, idioma, sistema operacional e provedor de internet;',
                  'Registros de acesso e uso, incluindo páginas visitadas, tempo de permanência, ações realizadas, erros do sistema e horários de acesso;',
                  'Dados técnicos de desempenho e segurança, utilizados para monitorar estabilidade, detectar falhas, prevenir fraudes e otimizar a experiência do usuário.'
                ]
              },
              {
                tipo: 'paragrafo',
                texto: 'Sempre que possível, essas informações são coletadas de forma anônima ou pseudonimizada, não permitindo a identificação direta do usuário.'
              },
              {
                tipo: 'paragrafo',
                texto: 'Além disso, utilizamos ferramentas analíticas (como o Google Analytics) para compreender padrões de uso e aprimorar continuamente nossos serviços, conforme descrito em nossa Política de Cookies.'
              }
            ]
          },
          {
            titulo: 'Dados que não coletamos',
            conteudo: [
              {
                tipo: 'paragrafo',
                texto: 'A Tecfy não coleta, solicita ou trata dados pessoais sensíveis, tais como: origem racial ou étnica, convicções religiosas, opiniões políticas, filiação a sindicatos, dados genéticos, biométricos, informações relativas à saúde ou à vida sexual, entre outros definidos pela Lei nº 13.709/2018 (LGPD).'
              },
              {
                tipo: 'paragrafo',
                texto: 'Da mesma forma, a Tecfy não realiza o tratamento intencional de dados pessoais de menores de 18 anos.'
              },
              {
                tipo: 'paragrafo',
                texto: 'Caso identifiquemos que informações de menores foram fornecidas indevidamente, adotaremos medidas imediatas para excluir os dados e, se necessário, encerrar o acesso associado.'
              },
            ]
          },
        ]
      },
      {
        titulo: '2. Como utilizamos os dados pessoais',
        conteudoGeral: [
          {
            tipo: 'paragrafo',
            texto: 'A Tecfy utiliza os dados pessoais coletados exclusivamente para finalidades legítimas e compatíveis com a prestação e aprimoramento de seus serviços. Em especial, podemos utilizar suas informações para:'
          },
          {
            tipo: 'lista',
            itens: [
              'Fornecer, operar e manter nossos serviços, incluindo suporte técnico, personalização de experiências e comunicação direta com o usuário;',
              'Processar solicitações de contato, orçamento, demonstração ou proposta comercial, conforme o interesse manifestado pelo titular;',
              'Gerenciar cadastros, contas e relacionamentos com clientes, parceiros e fornecedores;',
              'Desenvolver, aperfeiçoar e otimizar o desempenho, a segurança e a usabilidade de nossos sistemas e plataformas;',
              'Cumprir obrigações legais, regulatórias e contratuais, inclusive relacionadas à prevenção de fraudes e incidentes de segurança;',
              'Assegurar a integridade, disponibilidade e confidencialidade das informações tratadas em nossos ambientes digitais;',
              'Enviar comunicações institucionais, informativos, novidades e atualizações sobre nossos produtos e serviços — somente quando houver consentimento prévio do titular;',
              'Gerar métricas, análises e relatórios técnicos de uso, de forma agregada e anonimizada, sem permitir a identificação pessoal dos usuários.'
            ]
          },
          {
            tipo: 'paragrafo',
            texto: 'Além disso, poderemos anonimizar ou agregar dados pessoais para fins estatísticos, de pesquisa ou aprimoramento de performance, garantindo que não haja possibilidade de identificação individual.'
          }
        ],
      },
      {
        titulo: '3. Compartilhamento de dados',
        conteudoGeral: [
          {
            tipo: 'paragrafo',
            texto: 'A Tecfy não vende, aluga ou comercializa dados pessoais sob nenhuma circunstância.\n' +
              'O compartilhamento de informações ocorre somente quando necessário para o funcionamento adequado dos nossos serviços, e sempre com base legal ou consentimento do titular, conforme os casos. Podemos compartilhar dados com:',
          },
          {
            tipo: 'lista',
            itens: [
              'Prestadores de serviço e parceiros técnicos, como provedores de hospedagem, servidores em nuvem, plataformas de e-mail, automação, CRM e ferramentas analíticas;',
              'Instituições financeiras e processadores de pagamento, para viabilizar transações e cobranças;',
              'Autoridades públicas, órgãos reguladores ou judiciais, quando houver obrigação legal, regulatória ou determinação judicial;',
              'Empresas do mesmo grupo econômico, com finalidade administrativa, operacional ou de integração de sistemas;',
              'Terceiros autorizados, mediante consentimento expresso do titular, para integrações, parcerias ou funcionalidades específicas.'
            ]
          },
          {
            tipo: 'paragrafo',
            texto: 'Todos os terceiros que tratam dados em nome da Tecfy são contratualmente obrigados a adotar medidas de segurança, confidencialidade e conformidade com a LGPD, garantindo a proteção e o uso adequado das informações.',
          },
        ]
      },
      {
        titulo: '4. Retenção de dados',
        conteudoGeral: [
          {
            tipo: 'paragrafo',
            texto: 'A Tecfy mantém os dados pessoais apenas pelo tempo necessário para cumprir as finalidades descritas nesta Política, ou enquanto perdurarem obrigações legais, contratuais ou legítimos interesses que justifiquem seu armazenamento.',
          },
          {
            tipo: "paragrafo",
            texto: "Encerradas essas finalidades, os dados serão excluídos, anonimizados ou armazenados de forma segura, observando os prazos e requisitos definidos pela legislação aplicável.",
          },
        ]
      },
      {
        titulo: '5. Segurança',
        conteudoGeral: [
          {
            tipo: "paragrafo",
            texto: "A TECFY adota medidas técnicas e organizacionais rigorosas para proteger seus dados pessoais contra acesso não autorizado, uso indevido, perda, vazamento, alteração ou destruição indevida.",
          },
          {
            tipo: "paragrafo",
            texto: "Entre as medidas implementadas, destacam-se:"
          },
          {
            tipo: "lista",
            itens: [
              'Criptografia de dados em repouso e em trânsito;',
              'Controle de acesso baseado em funções e níveis de permissão;',
              'Monitoramento contínuo, registros de logs e auditorias de segurança;',
              'Adoção de boas práticas de desenvolvimento seguro e atualização de sistemas.'
            ]
          },
          {
            tipo: "paragrafo",
            texto: "Embora empreguemos padrões elevados de segurança, nenhum sistema é completamente imune a incidentes, e a TECFY não se responsabiliza por falhas decorrentes de ações de terceiros fora de sua esfera de controle.",
          }
        ]
      },
      {
        titulo: '6. Seus direitos e escolhas',
        conteudoGeral: [
          {
            tipo: "paragrafo",
            texto: "Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem os seguintes direitos:",
          },
          {
            tipo: "lista",
            itens: [
              "Confirmar se tratamos seus dados pessoais;",
              "Acessar os dados que possuímos sobre você;",
              "Corrigir dados incompletos, inexatos ou desatualizados;",
              "Solicitar anonimização, bloqueio ou exclusão de dados desnecessários;",
              "Solicitar a portabilidade dos dados a outro fornecedor;",
              "Revogar o consentimento a qualquer momento;",
              "Solicitar informações sobre compartilhamento de dados com terceiros;",
              "Opor-se a tratamentos realizados com base em legítimo interesse.",
            ]
          },
          {
            tipo: "paragrafo",
            texto: "Para exercer seus direitos, basta enviar uma solicitação ao nosso Encarregado de Proteção de Dados (DPO) através do e-mail: contato@tecfy.dev",
          }
        ]
      },
      {
        titulo: '7. Transferências internacionais',
        conteudoGeral: [
          {
            tipo: "paragrafo",
            texto: "A Tecfy poderá armazenar, processar ou espelhar dados pessoais em servidores localizados fora do Brasil, incluindo provedores reconhecidos mundialmente, como AWS, Google Cloud, Microsoft Azure, Vercel ou Render.",
          },
          {
            tipo: "paragrafo",
            texto: "Quando essas transferências ocorrerem, garantimos que os dados sejam tratados de acordo com os padrões de proteção exigidos pela Lei Geral de Proteção de Dados (LGPD), adotando uma das seguintes medidas:",
          },
          {
            tipo: "lista",
            itens: [
              "Transferência para países com nível de proteção de dados adequado, reconhecido pela Autoridade Nacional de Proteção de Dados (ANPD);",
              "Cláusulas contratuais específicas que assegurem a observância de direitos, garantias e boas práticas de segurança;",
              "Auditorias e controles adicionais quando necessário, para garantir a conformidade e integridade dos dados."
            ]
          },
          {
            tipo: "paragrafo",
            texto: "Em todos os casos, a Tecfy assegura que o tratamento ocorra de forma segura, transparente e compatível com as finalidades originais da coleta.",
          }
        ]
      },
      {
        titulo: '8. Alterações nesta Política de Privacidade',
        conteudoGeral: [
          {
            tipo: "paragrafo",
            texto: "A Tecfy poderá atualizar esta Política de Privacidade periodicamente, para refletir mudanças legais, regulatórias, tecnológicas ou operacionais.",
          },
          {
            tipo: "paragrafo",
            texto: "Sempre que houver atualização, a nova versão será publicada nesta página, com a data de última modificação claramente indicada."
          },
          {
            tipo: "paragrafo",
            texto: "Recomendamos que você revise esta Política regularmente. O uso contínuo dos nossos serviços após a publicação das alterações representará a sua concordância com os novos termos.",
          }
        ]
      },
      {
        titulo: '9. Contato',
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
  // ... adicione os outros termos aqui
];