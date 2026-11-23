import type { SitePlan } from "@/lib/site/plans";

/**
 * Planos FIXOS — só aparecem enquanto o painel nunca publicou a seção de planos (ou se o Firestore
 * falhar). Depois da primeira "Publicar no site" (tela Produtos), o site usa `site_content/plans`.
 */
type FallbackPlan = Omit<SitePlan, "promo" | "price_change" | "setup_fee" | "cta" | "billing"> & Partial<Pick<SitePlan, "cta">>;

const plans: FallbackPlan[] = [
  {
    id: "static-landing",
    name: "Landing",
    section: "monthly",
    price: 647,
    price_label: null,
    description: "Uma Landing Page de alta conversão pronta para escala.",
    features: [
      { icon: "file", text: "Página única para alta conversão." },
      { icon: "bezier", text: "Design 100% personalizado." },
      { icon: "search", text: "Otimização para SEO e velocidade." },
      { icon: "whatsapp", text: "Integração com WhatsApp ou CRM." },
      { icon: "gear", text: "Manutenção e suporte técnico." },
    ],
    highlight: false,
  },
  {
    id: "static-starter",
    name: "Starter",
    section: "monthly",
    price: 2709,
    price_label: null,
    description: "Website completo e otimizado com integrações únicas.",
    features: [
      { icon: "arrow_left", text: "Inclui tudo do Landing." },
      { icon: "file", text: "Website com até 7 páginas." },
      { icon: "bezier", text: "Painel de Gerenciamento (CMS)." },
      { icon: "money", text: "Franquia de recursos (R$150/mês)." },
      { icon: "gear", text: "Manutenção e suporte técnico." },
    ],
    highlight: true,
  },
  {
    id: "static-pro",
    name: "Pro",
    section: "monthly",
    price: 5417,
    price_label: null,
    description: "App multiplataforma com landing page ou website.",
    features: [
      { icon: "arrow_left", text: "Inclui tudo do Starter." },
      { icon: "file", text: "Sistema com até 14 páginas." },
      { icon: "chart_bar", text: "Relatórios mensais personalizados." },
      { icon: "money", text: "Franquia de recursos (R$250/mês)." },
      { icon: "gear", text: "Manutenção e suporte técnico prioritário 24/7." },
    ],
    highlight: false,
  },
  {
    id: "static-ultimate",
    name: "Ultimate",
    section: "monthly",
    price: 14542,
    price_label: null,
    description: "Tudo que você imaginar, com tecnologia para o futuro.",
    features: [
      { icon: "arrow_left", text: "Inclui tudo do Pro." },
      { icon: "file", text: "Sistema com até 32 páginas." },
      { icon: "chart_bar", text: "Integração ou criação de inteligência artificial." },
      { icon: "money", text: "Franquia de recursos (R$1250/mês)." },
      { icon: "gear", text: "Manutenção e suporte com gestor dedicado 24/7." },
    ],
    highlight: false,
  },
  {
    id: "static-startup",
    name: "Startup",
    section: "oneTime",
    price: null,
    price_label: "SOB CONSULTA",
    description: "Desenvolva agora, pague conforme cresce. 25% no desenvolvimento, 25% após o lançamento e 50% após 12 meses. (Apenas para Startups).",
    features: [
      { icon: "rocket", text: "MVP Ágil." },
      { icon: "clock", text: "Desenvolvimento focado em Time-to-Market." },
      { icon: "headset", text: "3 meses de Hyper-care (suporte pós-lançamento)." },
      { icon: "code", text: "Propriedade total do código-fonte." },
      { icon: "layers", text: "Todas as plataformas." },
    ],
    highlight: false,
  },
  {
    id: "static-equity",
    name: "Equity",
    section: "oneTime",
    price: null,
    price_label: "SOB CONSULTA",
    description: "Desenvolvimento personalizado com pagamento até a conclusão do projeto. Sem mensalidades ou fidelidade.",
    features: [
      { icon: "handshake", text: "Pagamento sem fidelidade pelo desenvolvimento." },
      { icon: "ban", text: "Sem taxas mensais" },
      { icon: "wrench", text: "Alteração e manutenção sob demanda." },
      { icon: "code", text: "Propriedade total do código-fonte." },
      { icon: "globe", text: "Todas as plataformas." },
    ],
    highlight: false,
  },
];

export const fallbackPlans: SitePlan[] = plans.map((p) => ({
  ...p,
  billing: p.price === null ? "sob_consulta" : "mensal",
  setup_fee: null,
  cta: p.cta ?? `Assinar ${p.name}`,
  promo: null,
  price_change: null,
}));
