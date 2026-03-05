import PlansCardsGrouping from "./PlansCardsGrouping";


export default function Plans(){
    return (
        <section className="w-full flex flex-col items-center gap-6 lg:gap-12">
            {/* Agrupamento textual indicativo */}
            <div  className="flex flex-col gap-4 items-center px-4">
                <span className="text-[14px] text-secondary font-medium">PLANOS E VALORES</span>
                <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold sm:text-[48px] 2xl:text-[56px]">QUANTO VALE UMA SOLUÇÃO?</h2>
                <p className="text-center text-[14px] text-text-secondary sm:text-[14px] lg:text-[16px] xl:text-[16px]" >NOSSOS PLANOS FORAM DESENVOLVIDOS PARA TODOS OS TIPOS DE PROJETOS E CLIENTES, AQUI VOCÊ <br className="hidden sm:block" />ENCONTRA O CERTO PARA CADA NECESSIDADE DO SEU NEGÓCIO.</p>
            </div>

            <PlansCardsGrouping></PlansCardsGrouping>
        </section> 
    );
}