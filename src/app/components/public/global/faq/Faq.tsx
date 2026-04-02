import FaqAccordion from "./FaqAccordion"

export default function Faq(){
    return(
        <section className="w-full flex justify-center pt-32 pb-32 lg:pt-64 lg:pb-64 px-4">
            <div className=" max-w-[1440px] flex flex-col gap-9 lg:flex-row lg:gap-16">
                <div className="flex flex-col gap-4">
                    {/* Título com uppercase via Tailwind */}
                    <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold lg:text-start sm:text-[48px] 2xl:text-[56px] uppercase">
                        Perguntas frequentes sobre nós
                    </h2>
                    
                    {/* Parágrafo com texto natural e acentuação correta */}
                    <p className="text-center text-[14px] text-text-secondary sm:text-[14px] lg:text-start lg:text-[16px] xl:text-[16px] uppercase">
                        Ainda tem alguma dúvida? Aqui temos todas as suas respostas. <br className="hidden lg:block" />
                        Nossa central de ajuda é baseada em dúvidas frequentes de nossos clientes.
                    </p>
                </div>
                <FaqAccordion></FaqAccordion>
            </div>
        </section>
    )
}