/**
 * Modelos de mensagem (WhatsApp e e-mail) e variáveis.
 * Os modelos padrão ficam aqui no código (somente leitura). Os personalizados ficam em
 * Firestore `message_templates` e são editados na tela de Leads ("Modelos de mensagem").
 * Módulo puro: usado no cliente e no servidor.
 */
import type { LeadRow, MessageTemplate } from "./types";

/** Variáveis aceitas nos modelos. */
export const TEMPLATE_VARIABLES = [
  { key: "{primeiro_nome}", description: "Primeiro nome do contato (ou do lead)" },
  { key: "{nome}", description: "Nome completo do contato (ou do lead)" },
  { key: "{empresa}", description: "Empresa vinculada" },
  { key: "{plano}", description: "Plano de interesse (leads do site)" },
  { key: "{responsavel}", description: "Seu nome / responsável pelo lead" },
] as const;

export const BUILTIN_TEMPLATES: MessageTemplate[] = [
  {
    id: "builtin-wa-primeiro-contato",
    channel: "whatsapp",
    name: "Primeiro contato",
    subject: null,
    body: "Olá, {primeiro_nome}! Tudo bem? Aqui é {responsavel}, da Tecfy. Vi seu interesse e queria entender melhor o que você precisa. Podemos conversar rapidinho?",
    builtin: true,
  },
  {
    id: "builtin-wa-plano-site",
    channel: "whatsapp",
    name: "Interesse em plano do site",
    subject: null,
    body: "Oi, {primeiro_nome}! Sou {responsavel}, da Tecfy. Recebi seu contato pelo site sobre o {plano}. Posso te explicar como funciona e tirar suas dúvidas?",
    builtin: true,
  },
  {
    id: "builtin-wa-follow-up",
    channel: "whatsapp",
    name: "Follow-up",
    subject: null,
    body: "Oi, {primeiro_nome}! Passando para saber se conseguiu avaliar nossa conversa. Fico à disposição para qualquer dúvida. 🙂",
    builtin: true,
  },
  {
    id: "builtin-email-apresentacao",
    channel: "email",
    name: "Apresentação",
    subject: "{primeiro_nome}, vamos tirar seu projeto do papel?",
    body:
      "Olá, {primeiro_nome}!\n\nAqui é {responsavel}, da Tecfy. Obrigado pelo interesse.\n\n" +
      "Gostaria de entender melhor o momento da {empresa} e mostrar como podemos ajudar. " +
      "Você teria 30 minutos esta semana para uma conversa rápida?\n\nAbraço,",
    builtin: true,
  },
  {
    id: "builtin-email-follow-up",
    channel: "email",
    name: "Follow-up de proposta",
    subject: "Conseguiu avaliar a proposta, {primeiro_nome}?",
    body:
      "Oi, {primeiro_nome}!\n\nPassando para saber se conseguiu avaliar a proposta que enviamos. " +
      "Se quiser ajustar algo ou tirar dúvidas, é só responder este e-mail.\n\nAbraço,",
    builtin: true,
  },
];

export interface TemplateContext {
  name: string;
  company: string | null;
  plan: string | null;
  owner: string | null;
}

/** Contexto das variáveis a partir do lead (prefere o nome do contato vinculado). */
export function templateContextFromLead(lead: LeadRow, ownerFallback: string | null): TemplateContext {
  const plan = lead.interest_plan ? `plano ${lead.interest_plan.charAt(0).toUpperCase()}${lead.interest_plan.slice(1)}` : null;
  return {
    name: lead.contact?.name ?? lead.title,
    company: lead.company?.name ?? null,
    plan,
    owner: lead.owner_name ?? ownerFallback,
  };
}

/** Troca as variáveis do texto. Variável sem valor vira um texto neutro (ex.: "sua empresa"). */
export function fillTemplate(text: string, ctx: TemplateContext): string {
  const first = ctx.name.trim().split(/\s+/)[0] ?? ctx.name;
  return text
    .replaceAll("{primeiro_nome}", first)
    .replaceAll("{nome}", ctx.name)
    .replaceAll("{empresa}", ctx.company ?? "sua empresa")
    .replaceAll("{plano}", ctx.plan ?? "nosso plano")
    .replaceAll("{responsavel}", ctx.owner ?? "a equipe");
}

/** Link do WhatsApp: adiciona o 55 quando o número tem só DDD + número (10–11 dígitos). */
export function whatsappLink(phoneDigits: string, message: string): string {
  const digits = phoneDigits.replace(/\D/g, "");
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}
