/**
 * Opções dos selects do CRM (valor salvo no Firestore → rótulo em pt-BR).
 * Usado no cliente (modais) e no servidor (validação). Para mudar uma lista, edite aqui.
 * Atenção: trocar o `value` de uma opção já usada deixa os registros antigos com um valor órfão.
 */

export interface Option<T extends string = string> {
  value: T;
  label: string;
  /** Explicação curta mostrada no tooltip. */
  hint?: string;
}

function defineOptions<const T extends string>(options: readonly Option<T>[]) {
  const values = options.map((o) => o.value);
  return {
    options,
    is: (value: unknown): value is T => typeof value === "string" && (values as string[]).includes(value),
    label: (value: string | null | undefined): string => options.find((o) => o.value === value)?.label ?? "—",
    hint: (value: string | null | undefined): string | undefined => options.find((o) => o.value === value)?.hint,
  };
}

// ── Lead ─────────────────────────────────────────────────────────────────────

export const leadStages = defineOptions([
  { value: "novo", label: "Novo lead", hint: "Acabou de chegar, ninguém falou com ele ainda." },
  { value: "tentativa_contato", label: "Tentativa de contato", hint: "Já tentamos falar, sem resposta até agora." },
  { value: "qualificacao", label: "Qualificação", hint: "Em conversa para entender necessidade, prazo e orçamento." },
  { value: "reuniao_agendada", label: "Reunião agendada", hint: "Tem reunião marcada." },
  { value: "proposta_enviada", label: "Proposta enviada", hint: "Proposta enviada, aguardando retorno." },
  { value: "em_negociacao", label: "Em negociação", hint: "Virou negociação: valores e condições em discussão." },
  { value: "perdido", label: "Perdido", hint: "Não vai fechar agora." },
] as const);
export type LeadStage = (typeof leadStages.options)[number]["value"];

export const leadQualifications = defineOptions([
  { value: "a_qualificar", label: "A qualificar", hint: "Ainda não avaliado." },
  { value: "frio", label: "Frio", hint: "Pouco interesse ou sem fit no momento." },
  { value: "morno", label: "Morno", hint: "Tem interesse, mas sem urgência." },
  { value: "quente", label: "Quente", hint: "Interesse alto, pronto para proposta." },
  { value: "venda_certa", label: "Venda na certa!", hint: "Decisão tomada: só falta fechar." },
] as const);
export type LeadQualification = (typeof leadQualifications.options)[number]["value"];

/** Cada status vira um ícone na lista (ver `LeadStatusIcon`). */
export const leadStatuses = defineOptions([
  { value: "novo", label: "Novo", hint: "Lead novo, ainda não trabalhado." },
  { value: "em_andamento", label: "Em andamento", hint: "Alguém está trabalhando este lead." },
  { value: "pausado", label: "Pausado", hint: "Parado por enquanto (pediu para retomar depois)." },
  { value: "convertido", label: "Convertido", hint: "Virou negociação." },
  { value: "perdido", label: "Perdido", hint: "Desistiu ou não tem fit." },
  { value: "arquivado", label: "Arquivado", hint: "Guardado, fora do trabalho do dia a dia." },
] as const);
export type LeadStatus = (typeof leadStatuses.options)[number]["value"];

export const leadSources = defineOptions([
  { value: "website", label: "Website" },
  { value: "indicacao", label: "Indicação" },
  { value: "prospeccao_ativa", label: "Prospecção ativa" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "google", label: "Google" },
  { value: "evento", label: "Evento" },
  { value: "outro", label: "Outro" },
] as const);
export type LeadSource = (typeof leadSources.options)[number]["value"];

/** Como o lead entrou no CRM. Definido só no servidor, nunca enviado pelo cliente. */
export const leadEntries = defineOptions([
  { value: "manual", label: "Manual" },
  { value: "website", label: "Website" },
] as const);
export type LeadEntry = (typeof leadEntries.options)[number]["value"];

// ── Contato ──────────────────────────────────────────────────────────────────

export const contactChannels = defineOptions([
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "linkedin", label: "LinkedIn" },
] as const);
export type ContactChannel = (typeof contactChannels.options)[number]["value"];

export const contactConsents = defineOptions([
  { value: "nao_informada", label: "Não informada" },
  { value: "autorizada", label: "Autorizada" },
  { value: "nao_autorizada", label: "Não autorizada" },
] as const);
export type ContactConsent = (typeof contactConsents.options)[number]["value"];

// ── Empresa ──────────────────────────────────────────────────────────────────

export const companySegments = defineOptions([
  { value: "tecnologia", label: "Tecnologia" },
  { value: "consultoria", label: "Consultoria empresarial" },
  { value: "varejo", label: "Varejo e e-commerce" },
  { value: "servicos", label: "Serviços" },
  { value: "saude", label: "Saúde" },
  { value: "educacao", label: "Educação" },
  { value: "industria", label: "Indústria" },
  { value: "financeiro", label: "Financeiro" },
  { value: "imobiliario", label: "Imobiliário" },
  { value: "agro", label: "Agronegócio" },
  { value: "outro", label: "Outro" },
] as const);
export type CompanySegment = (typeof companySegments.options)[number]["value"];

export const companySizes = defineOptions([
  { value: "mei", label: "MEI" },
  { value: "micro", label: "Microempresa" },
  { value: "pequena", label: "Pequena empresa" },
  { value: "media", label: "Média empresa" },
  { value: "grande", label: "Grande empresa" },
] as const);
export type CompanySize = (typeof companySizes.options)[number]["value"];

/** "Estado / país": as 27 UFs do Brasil + exterior. */
export const companyRegions = defineOptions([
  { value: "AC", label: "AC · Brasil" },
  { value: "AL", label: "AL · Brasil" },
  { value: "AP", label: "AP · Brasil" },
  { value: "AM", label: "AM · Brasil" },
  { value: "BA", label: "BA · Brasil" },
  { value: "CE", label: "CE · Brasil" },
  { value: "DF", label: "DF · Brasil" },
  { value: "ES", label: "ES · Brasil" },
  { value: "GO", label: "GO · Brasil" },
  { value: "MA", label: "MA · Brasil" },
  { value: "MT", label: "MT · Brasil" },
  { value: "MS", label: "MS · Brasil" },
  { value: "MG", label: "MG · Brasil" },
  { value: "PA", label: "PA · Brasil" },
  { value: "PB", label: "PB · Brasil" },
  { value: "PR", label: "PR · Brasil" },
  { value: "PE", label: "PE · Brasil" },
  { value: "PI", label: "PI · Brasil" },
  { value: "RJ", label: "RJ · Brasil" },
  { value: "RN", label: "RN · Brasil" },
  { value: "RS", label: "RS · Brasil" },
  { value: "RO", label: "RO · Brasil" },
  { value: "RR", label: "RR · Brasil" },
  { value: "SC", label: "SC · Brasil" },
  { value: "SP", label: "SP · Brasil" },
  { value: "SE", label: "SE · Brasil" },
  { value: "TO", label: "TO · Brasil" },
  { value: "EX", label: "Exterior" },
] as const);
export type CompanyRegion = (typeof companyRegions.options)[number]["value"];
