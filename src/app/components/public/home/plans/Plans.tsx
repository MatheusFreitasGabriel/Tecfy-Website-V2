import { getSitePlans } from "@/lib/site/getSitePlans";
import PlansCardsGrouping from "./PlansCardsGrouping";

/** Seção "Planos e valores". Os planos vêm do painel (tela Produtos → "Publicar no site"). */
export default async function Plans({id}: {id: string}){
    const plans = await getSitePlans();
    // eslint-disable-next-line react-hooks/purity -- horário da renderização (ISR), base da hidratação
    const renderedAt = Date.now();
    return (
        <section id={id} className="w-full flex flex-col items-center gap-6 lg:gap-12 scroll-mt-34">
            {/* Agrupamento textual indicativo */}
            <div className="flex flex-col gap-4 items-center px-4">
                <span className="text-[14px] text-secondary font-medium uppercase">
                    Planos e valores
                </span>

                <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold sm:text-[48px] 2xl:text-[56px] uppercase">
                    Quanto vale uma solução?
                </h2>

                <p className="text-center text-[14px] text-text-secondary sm:text-[14px] lg:text-[16px] xl:text-[16px] uppercase">
                    Nossos planos foram desenvolvidos para todos os tipos de projetos e clientes; aqui você <br className="hidden sm:block" />
                    encontra o certo para cada necessidade do seu negócio.
                </p>
            </div>

            <PlansCardsGrouping plans={plans} renderedAt={renderedAt}></PlansCardsGrouping>
        </section>
    );
}
