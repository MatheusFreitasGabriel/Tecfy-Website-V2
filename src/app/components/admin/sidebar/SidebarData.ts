import type { IconType } from "react-icons";
// Todos os ícones do painel são do Font Awesome 6 (react-icons/fa6).
import {
  FaAddressBook,
  FaBuildingUser,
  FaHandshake,
  FaHouse,
  FaLaptopCode,
  FaListCheck,
  FaUserPlus,
} from "react-icons/fa6";

export interface SidebarItem {
  /** Nome mostrado na sidebar e na pesquisa. */
  label: string;
  /** Texto de apoio mostrado na pesquisa (também entra na busca). */
  description: string;
  /** Caminho relativo ao painel — o basePath é adicionado na hora de navegar. */
  href: string;
  icon: IconType;
  /** Palavras extras que também encontram esta tela na pesquisa. */
  keywords?: string[];
}

export interface SidebarBlock {
  title: string;
  items: SidebarItem[];
}

/** Blocos da sidebar. Toda tela adicionada aqui também aparece na pesquisa (Ctrl+F). */
export const sidebarBlocks: SidebarBlock[] = [
  {
    title: "Visão geral",
    items: [
      {
        label: "Dashboard",
        description: "Visão geral do painel",
        href: "/",
        icon: FaHouse,
        keywords: ["inicio", "home", "painel", "visao geral"],
      },
    ],
  },
  {
    title: "CRM",
    items: [
      {
        label: "Leads",
        description: "Pessoas interessadas que chegaram pelo site",
        href: "/leads",
        icon: FaUserPlus,
        keywords: ["formulario", "interessados", "prospects", "crm"],
      },
      {
        label: "Contatos",
        description: "Agenda de pessoas de contato",
        href: "/contatos",
        icon: FaAddressBook,
        keywords: ["pessoas", "agenda", "clientes", "crm"],
      },
      {
        label: "Empresas",
        description: "Empresas clientes e prospects",
        href: "/empresas",
        icon: FaBuildingUser,
        keywords: ["clientes", "organizacoes", "contas", "crm"],
      },
      {
        label: "Negociações",
        description: "Oportunidades e propostas em andamento",
        href: "/negociacoes",
        icon: FaHandshake,
        keywords: ["vendas", "deals", "propostas", "funil", "pipeline", "crm"],
      },
      {
        label: "Tarefas",
        description: "Atividades e follow-ups",
        href: "/tarefas",
        icon: FaListCheck,
        keywords: ["atividades", "todo", "pendencias", "follow-up", "crm"],
      },
      {
        label: "Produtos",
        description: "Produtos e serviços oferecidos",
        href: "/produtos",
        icon: FaLaptopCode,
        keywords: ["servicos", "planos", "catalogo", "software", "crm"],
      },
    ],
  },
];

/** Monta o link final da tela a partir do endereço do painel. */
export function buildAdminHref(basePath: string, href: string): string {
  if (href === "/") return basePath || "/";
  return `${basePath}${href}`;
}
