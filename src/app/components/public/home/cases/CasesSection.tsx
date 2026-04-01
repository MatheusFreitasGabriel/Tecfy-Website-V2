import CasesCards from "./CasesCards";

export default function Cases({id}: {id: string}){
    return (
        <section id={id} className="w-full flex flex-col items-center gap-6 lg:gap-12 scroll-mt-36">
            {/* Agrupamento textual indicativo */}
            <div  className="flex flex-col gap-4 items-center px-4">
                <span className="text-[14px] text-secondary font-medium">PORTFÓLIO</span>
                <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold sm:text-[48px] 2xl:text-[56px]">NOSSO TRABALHO</h2>
                <p className="text-center text-[14px] text-text-secondary sm:text-[14px] lg:text-[16px] xl:text-[16px]" >VEJA O NOSSO TRABALHO E NOSSOS CASOS DE SUCESSO, <br className="hidden sm:block" />SE INSPIRE NELES POIS ELES SÃO DE QUALIDADE TECFY</p>
            </div>
            {/* Cards com os serviços */}
            <CasesCards></CasesCards>
        </section> 
    );
}