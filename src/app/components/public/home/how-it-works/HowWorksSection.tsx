import HowWorksCard from "./HowWorksCard";

export default function HowWorks(){
    return (
        <section className="w-full flex flex-col items-center gap-8 lg:gap-12">
            {/* Agrupamento textual indicativo */}
            <div  className="flex flex-col gap-4 items-center px-4">
                <span className="text-[14px] text-secondary font-medium">COMO FUNCIONA</span>
                <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold sm:text-[48px] 2xl:text-[56px]">DA IDEIA AO LANÇAMENTO</h2>
                <p className="text-center text-[14px] text-text-secondary sm:text-[14px] lg:text-[16px] xl:text-[16px]" >NOSSOS SISTEMAS SÃO DESENVOLVIDOS COM BASE EM ENGENHARIA, ARQUITETURA <br className="hidden sm:block" />E PRINCIPIOS DE SEGURANÇA</p>
            </div>
            
            <HowWorksCard></HowWorksCard>
        </section> 
    );   
}