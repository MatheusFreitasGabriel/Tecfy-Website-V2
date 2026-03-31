import FaqAccordion from "./FaqAccordion"

export default function Faq(){
    return(
        <section className="w-full flex justify-center pt-32 pb-32 lg:pt-64 lg:pb-64 px-4">
            <div className=" max-w-[1440px] flex flex-col gap-9  lg:flex-row lg:gap-16">
                <div className="flex flex-col gap-4">
                    <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold lg:text-start sm:text-[48px] 2xl:text-[56px]">PERGUNTAS FREQUENTES SOBRE NÓS</h2>
                    <p className="text-center text-[14px] text-text-secondary sm:text-[14px] lg:text-start lg:text-[16px] xl:text-[16px]">AINDA TEM ALGUMA DÚVIDA? AQUI TEMOS TODAS AS SUAS RESPOSTAS, APENAS APROVEITE. NOSSAS RESPOSTAS SÃO BASEADAS EM DUVIDAS FREQUENTES DE CLIENTES</p>
                </div>
                <FaqAccordion></FaqAccordion>
            </div>
        </section>
    )
}