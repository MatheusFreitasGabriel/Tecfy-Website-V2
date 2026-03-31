import { IconType } from "react-icons";
import { FaBan, FaBezierCurve, FaChartBar, FaClock, FaCode, FaGlobe, FaHandshake, FaHeadset, FaLayerGroup, FaRocket, FaScrewdriver, FaSearchengin, FaWhatsapp } from "react-icons/fa";
import { FaArrowLeft, FaFileLines, FaGear, FaMoneyCheckDollar, FaScrewdriverWrench } from "react-icons/fa6";

{/* Tipos de planos */}
export type PricingType = "monthly" | "oneTime";

type FeatureItem = {
    icon: IconType,
    contentText: string,
};

{/* Estrutura dos planos */}
type CardsDataType = {
    namePlan: string,
    type: "monthly" | "oneTime";
    pricePlan: number | null,
    priceLabel?: string,
    descriptionPlan: string,
    featuresPlan: FeatureItem[],
    highlightPlan: boolean
  };

{/* Estrutura de dados de cada plano */}
export const plansCardsData: CardsDataType[] = [
    {
        namePlan: "Landing",
        type: "monthly",
        pricePlan: 647,
        descriptionPlan: "Uma Landing Page de alta conversão pronta para escala.",
        featuresPlan: [
            {
                icon: FaFileLines,
                contentText: "Página única para alta conversão.",
            },
            {
                icon: FaBezierCurve,
                contentText: "Design 100% personalizado.",
            },
            {
                icon: FaSearchengin,
                contentText: "Otimização para SEO e velocidade.",
            },
            {
                icon: FaWhatsapp,
                contentText: "Integração com WhatsApp ou CRM.",
            },
            {
                icon: FaGear,
                contentText: "Manutenção e suporte técnico.",
            },
        ],
        highlightPlan: false,
    },

    {
        namePlan: "Starter",
        type: "monthly",
        pricePlan: 2709,
        descriptionPlan: "Website completo e otimizado com integrações únicas.",
        featuresPlan: [
            {
                icon: FaArrowLeft,
                contentText: "Inclui tudo do Landing.",
            },
            {
                icon: FaFileLines,
                contentText: "Website com até 7 páginas.",
            },
            {
                icon: FaBezierCurve,
                contentText: "Painel de Gerenciamento (CMS).",
            },
            {
                icon: FaMoneyCheckDollar,
                contentText: "Franquia de recursos (R$150/mês).",
            },
            {
                icon: FaGear,
                contentText: "Manutenção e suporte técnico.",
            },
        ],
        highlightPlan: true,
    },

    {
        namePlan: "Pro",
        type: "monthly",
        pricePlan: 5417,
        descriptionPlan: "App multiplataforma com landing page ou website.",
        featuresPlan: [
            {
                icon: FaArrowLeft,
                contentText: "Inclui tudo do Starter.",
            },
            {
                icon: FaFileLines,
                contentText: "Sistema com até 14 páginas.",
            },
            {
                icon: FaChartBar,
                contentText: "Relatórios mensais personalizados.",
            },
            {
                icon: FaMoneyCheckDollar,
                contentText: "Franquia de recursos (R$250/mês).",
            },
            {
                icon: FaGear,
                contentText: "Manutenção e suporte técnico prioritário 24/7.",
            },
        ],
        highlightPlan: false,
    },

    {
        namePlan: "Ultimate",
        type: "monthly",
        pricePlan: 14542,
        descriptionPlan: "Tudo que você imaginar, com tecnologia para o futuro.",
        featuresPlan: [
            {
                icon: FaArrowLeft,
                contentText: "Inclui tudo do Pro.",
            },
            {
                icon: FaFileLines,
                contentText: "Sistema com até 32 páginas.",
            },
            {
                icon: FaChartBar,
                contentText: "Integração ou criação de inteligência artificial.",
            },
            {
                icon: FaMoneyCheckDollar,
                contentText: "Franquia de recursos (R$1250/mês).",
            },
            {
                icon: FaGear,
                contentText: "Manutenção e suporte com gestor dedicado 24/7.",
            },
        ],
        highlightPlan: false,
    },

    {
        namePlan: "Startup",
        type: "oneTime",
        pricePlan: null,
        priceLabel: "SOB CONSULTA",
        descriptionPlan: "Desenvolva agora, pague conforme cresce. 25% no desenvolvimento, 25% após o lançamento e 50% após 12 meses. (Apenas para Startups).",
        featuresPlan: [
            {
                icon: FaRocket,
                contentText: "MVP Ágil.",
            },
            {
                icon: FaClock,
                contentText: "Desenvolvimento focado em Time-to-Market.",
            },
            {
                icon: FaHeadset,
                contentText: "3 meses de Hyper-care (suporte pós-lançamento).",
            },
            {
                icon: FaCode,
                contentText: "Propriedade total do código-fonte.",
            },
            {
                icon: FaLayerGroup,
                contentText: "Todas as plataformas.",
            },
        ],
        highlightPlan: false,
    },

    {
        namePlan: "Equity",
        type: "oneTime",
        pricePlan: null,
        priceLabel: "SOB CONSULTA",
        descriptionPlan: "Desenvolvimento personalizado com pagamento até a conclusão do projeto. Sem mensalidades ou fidelidade.",
        featuresPlan: [
            {
                icon: FaHandshake,
                contentText: "Pagamento sem fidelidade pelo desenvolvimento.",
            },
            {
                icon: FaBan,
                contentText: "Sem taxas mensais",
            },
            {
                icon: FaScrewdriverWrench,
                contentText: "Alteração e manutenção sob demanda.",
            },
            {
                icon: FaCode,
                contentText: "Propriedade total do código-fonte.",
            },
            {
                icon: FaGlobe,
                contentText: "Todas as plataformas.",
            },
        ],
        highlightPlan: false,
    },
];