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

// ── Contato / Empresa: situação no cadastro ─────────────────────────────────

/** Contatos e empresas não são apagados: ficam inativos. Ausente no documento = ativo. */
export const entityStatuses = defineOptions([
  { value: "ativo", label: "Ativo", hint: "Cadastro em uso." },
  { value: "inativo", label: "Inativo", hint: "Guardado para histórico, fora do dia a dia." },
] as const);
export type EntityStatus = (typeof entityStatuses.options)[number]["value"];

// ── Negociações ──────────────────────────────────────────────────────────────

/** Status da negociação (cada um com uma cor no card: azul claro, cinza, vermelho, verde). */
export const dealStatuses = defineOptions([
  { value: "em_andamento", label: "Em andamento", hint: "Negociação ativa, em movimento no funil." },
  { value: "pausada", label: "Pausada", hint: "Parada por enquanto (cliente pediu para retomar depois)." },
  { value: "perdida", label: "Perdida", hint: "Não fechou. O motivo fica registrado." },
  { value: "vendida", label: "Vendida", hint: "Fechou! Virou contrato e a empresa é cliente." },
] as const);
export type DealStatus = (typeof dealStatuses.options)[number]["value"];

/** Como a negociação nasceu. */
export const dealOrigins = defineOptions([
  { value: "lead_website", label: "Lead do site" },
  { value: "lead_manual", label: "Lead manual" },
  { value: "manual", label: "Criada manualmente" },
] as const);
export type DealOrigin = (typeof dealOrigins.options)[number]["value"];

/** Qualificação da negociação em estrelas (1 = mais baixa, 5 = mais alta). */
export const dealQualifications = defineOptions([
  { value: "1", label: "1 estrela", hint: "A qualificar" },
  { value: "2", label: "2 estrelas", hint: "Frio" },
  { value: "3", label: "3 estrelas", hint: "Morno" },
  { value: "4", label: "4 estrelas", hint: "Quente" },
  { value: "5", label: "5 estrelas", hint: "Venda na certa" },
] as const);

/** Qualificação do lead → estrelas da negociação. */
export const STARS_FROM_LEAD_QUALIFICATION: Record<LeadQualification, number> = {
  a_qualificar: 1,
  frio: 2,
  morno: 3,
  quente: 4,
  venda_certa: 5,
};

export const taskTypes = defineOptions([
  { value: "follow_up", label: "Follow-up" },
  { value: "ligacao", label: "Ligação" },
  { value: "reuniao", label: "Reunião" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "proposta", label: "Proposta" },
  { value: "outro", label: "Outro" },
] as const);
export type TaskType = (typeof taskTypes.options)[number]["value"];

/** Tipos de campo personalizado da negociação (por funil). */
export const customFieldTypes = defineOptions([
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "currency", label: "Moeda (R$)" },
  { value: "date", label: "Data" },
  { value: "select", label: "Seleção (lista)" },
  { value: "boolean", label: "Sim / Não" },
] as const);
export type CustomFieldType = (typeof customFieldTypes.options)[number]["value"];

/** Cores das etapas do funil (nome → classe de fundo/texto no Kanban). */
export const stageColors = defineOptions([
  { value: "slate", label: "Cinza" },
  { value: "blue", label: "Azul" },
  { value: "violet", label: "Roxo" },
  { value: "amber", label: "Âmbar" },
  { value: "orange", label: "Laranja" },
  { value: "green", label: "Verde" },
] as const);
export type StageColor = (typeof stageColors.options)[number]["value"];

// ── Produtos ─────────────────────────────────────────────────────────────────

/** Como o produto é cobrado. Produtos antigos sem o campo: mensal se tiver preço, senão sob consulta. */
export const productBillings = defineOptions([
  { value: "mensal", label: "Mensal", hint: "Mensalidade fixa, com fidelidade mínima." },
  { value: "sob_consulta", label: "Sob consulta", hint: "Mensalidade negociada em cada venda." },
  { value: "unico", label: "Pagamento único", hint: "Projeto ou serviço pago uma vez só (não entra no faturamento mensal)." },
] as const);
export type ProductBilling = (typeof productBillings.options)[number]["value"];

/** Ícones disponíveis para o produto (nomes ligados aos ícones Font Awesome em `productVisuals`). */
export const productIcons = defineOptions([
  { value: "rocket", label: "Foguete" },
  { value: "code", label: "Código" },
  { value: "globe", label: "Site" },
  { value: "layers", label: "Camadas" },
  { value: "mobile", label: "App" },
  { value: "cart", label: "Loja" },
  { value: "chart", label: "Dados" },
  { value: "robot", label: "Automação" },
  { value: "headset", label: "Suporte" },
  { value: "handshake", label: "Parceria" },
  { value: "gem", label: "Premium" },
  { value: "box", label: "Pacote" },
] as const);
export type ProductIcon = (typeof productIcons.options)[number]["value"];

/** Motivos de cancelamento de contrato. */
export const cancelReasons = defineOptions([
  { value: "preco", label: "Preço" },
  { value: "insatisfacao", label: "Insatisfação com o serviço" },
  { value: "encerrou", label: "Encerrou as atividades / projeto" },
  { value: "concorrente", label: "Foi para um concorrente" },
  { value: "interno", label: "Trouxe para dentro (equipe própria)" },
  { value: "inadimplencia", label: "Inadimplência" },
  { value: "upgrade", label: "Trocou de plano" },
  { value: "outro", label: "Outro motivo" },
] as const);

/** Motivos de perda da negociação. */
export const lostReasons = defineOptions([
  { value: "preco", label: "Preço" },
  { value: "concorrente", label: "Fechou com concorrente" },
  { value: "sem_orcamento", label: "Sem orçamento" },
  { value: "sem_resposta", label: "Parou de responder" },
  { value: "timing", label: "Não é o momento" },
  { value: "sem_fit", label: "Sem fit com a solução" },
  { value: "desistiu", label: "Desistiu do projeto" },
  { value: "outro", label: "Outro motivo" },
] as const);

/** Tipos de arquivo aceitos nas negociações (só documentos). */
export const DEAL_FILE_TYPES: Record<string, { ext: string; label: string; magic: "pdf" | "zip" }> = {
  "application/pdf": { ext: "pdf", label: "PDF", magic: "pdf" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", label: "Word", magic: "zip" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", label: "PowerPoint", magic: "zip" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", label: "Excel", magic: "zip" },
};
export const DEAL_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** A que a tarefa está ligada. */
export const taskParents = defineOptions([
  { value: "deal", label: "Negociação" },
  { value: "lead", label: "Lead" },
  { value: "contact", label: "Contato" },
  { value: "company", label: "Empresa" },
] as const);
export type TaskParentType = (typeof taskParents.options)[number]["value"];

/** Repetição da tarefa (ao concluir, a próxima é criada). */
export const taskRecurrences = defineOptions([
  { value: "daily", label: "Todo dia" },
  { value: "weekdays", label: "Dias úteis (seg–sex)" },
  { value: "weekly", label: "Toda semana" },
  { value: "monthly", label: "Todo mês" },
  { value: "every_n_days", label: "A cada N dias" },
] as const);
export type TaskRecurrenceFreq = (typeof taskRecurrences.options)[number]["value"];

/** Lembrete antes do horário (minutos). */
export const taskReminders = defineOptions([
  { value: "0", label: "Na hora" },
  { value: "5", label: "5 min antes" },
  { value: "15", label: "15 min antes" },
  { value: "30", label: "30 min antes" },
  { value: "60", label: "1 hora antes" },
  { value: "120", label: "2 horas antes" },
  { value: "1440", label: "1 dia antes" },
] as const);
