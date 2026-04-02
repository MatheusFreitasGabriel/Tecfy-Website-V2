import {IconType} from 'react-icons';
import {FaLightbulb, FaPenNib, FaCode, FaTrophy} from "react-icons/fa";

{/* Definição de tipo dos steps */}
type ServiceWorkflowStep = {
    iconCard: IconType,
    titleCard: string,
    textCard: string,
}

{/* Conteudo dos steps */}
export const InformationCardsHowTheServicesWorks: ServiceWorkflowStep[] = [
    {
        iconCard: FaLightbulb,
        titleCard: "Sua ideia",
        textCard: "Alinhamos objetivos, definimos o escopo e traçamos o caminho do projeto."
    },

    {
        iconCard: FaPenNib,
        titleCard: "UX/UI",
        textCard: "Criamos o design do projeto com foco em clareza, usabilidade e identidade."
    },

    {
        iconCard: FaCode,
        titleCard: "Código",
        textCard: "Desenvolvemos o código, a arquitetura e segurança e fluxograma do seu sistema."
    },

    {
        iconCard: FaTrophy,
        titleCard: "Lançamento",
        textCard: "Lançamento grandioso, feito para aguentar trafego e a escalabilidade e o futuro do seu projeto!"
    },
]