import { IconType } from "react-icons";
import { FaLightbulb, FaPenNib, FaCode, FaTrophy } from "react-icons/fa";

// Conceito individual mostrado no painel de detalhes (título + descrição curta)
export type StepConcept = {
  title: string;
  description: string;
};

// Definição de tipo dos steps
export type ServiceWorkflowStep = {
  iconCard: IconType;
  titleCard: string;
  textCard: string;
  // Frase de abertura do painel de detalhes
  summaryCard: string;
  // Conceitos + o detalhe de cada um
  conceptsCard: StepConcept[];
};

// Conteúdo dos steps
export const InformationCardsHowTheServicesWorks: ServiceWorkflowStep[] = [
  {
    iconCard: FaLightbulb,
    titleCard: "Sua ideia",
    textCard: "Alinhamos objetivos, definimos o escopo e traçamos o caminho do projeto.",
    summaryCard:
      "Tratamos a sua ideia como se fosse nossa: mergulhamos no problema e já pensamos em arquitetura e segurança desde o primeiro dia.",
    conceptsCard: [
      { title: "Descoberta", description: "Entendemos o problema real antes de escrever uma linha de código." },
      { title: "Escopo", description: "Definimos com clareza o que entra — e o que não entra — no projeto." },
      { title: "Arquitetura", description: "Desenhamos a base técnica já pensando no crescimento." },
      { title: "Segurança", description: "Riscos e proteção considerados desde o dia zero." },
    ],
  },

  {
    iconCard: FaPenNib,
    titleCard: "UX/UI",
    textCard: "Criamos o design do projeto com foco em clareza, usabilidade e identidade.",
    summaryCard:
      "Prototipamos a experiência, validamos cada fluxo e traduzimos a sua marca em uma interface memorável.",
    conceptsCard: [
      { title: "Protótipo", description: "Testamos a ideia navegável antes de desenvolver." },
      { title: "Usabilidade", description: "Fluxos simples e diretos, sem fricção para o usuário." },
      { title: "Identidade", description: "Uma interface que realmente traduz a sua marca." },
      { title: "Acessibilidade", description: "Pensada para ser usável por todos, em qualquer tela." },
    ],
  },

  {
    iconCard: FaCode,
    titleCard: "Código",
    textCard: "Desenvolvemos o código, a arquitetura e segurança e fluxograma do seu sistema.",
    summaryCard:
      "Engenharia de verdade: código limpo, arquitetura escalável e segurança em cada camada da aplicação.",
    conceptsCard: [
      { title: "Arquitetura", description: "Estrutura escalável e organizada para crescer sem dor." },
      { title: "Segurança", description: "Proteção aplicada em cada camada do sistema." },
      { title: "Escalabilidade", description: "Preparado para aguentar o aumento de uso." },
      { title: "Testes", description: "Qualidade validada antes de qualquer coisa ir pro ar." },
    ],
  },

  {
    iconCard: FaTrophy,
    titleCard: "Lançamento",
    textCard: "Lançamento grandioso, feito para aguentar tráfego, escalabilidade e o futuro do projeto.",
    summaryCard:
      "Colocamos no ar preparado para tráfego alto, performance e o futuro — com monitoramento e suporte contínuos.",
    conceptsCard: [
      { title: "Performance", description: "Rápido mesmo sob carga alta de acessos." },
      { title: "Escalabilidade", description: "Cresce junto com a sua demanda." },
      { title: "Monitoramento", description: "Acompanhamos a saúde do sistema em tempo real." },
      { title: "Suporte", description: "Continuamos ao seu lado depois do go-live." },
    ],
  },
];
