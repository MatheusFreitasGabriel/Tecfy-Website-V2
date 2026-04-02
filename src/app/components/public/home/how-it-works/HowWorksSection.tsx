import HowWorksCard from "./HowWorksCard";

export default function HowWorks({id}: {id: string}){
    return (
        <section id={id} className="w-full flex flex-col items-center gap-8 lg:gap-12 scroll-mt-34">
            <div className="flex flex-col gap-4 items-center px-4">
                <span className="text-[14px] text-secondary font-medium uppercase">
                    Como funciona
                </span>
                
                <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold sm:text-[48px] 2xl:text-[56px] uppercase">
                    Da ideia ao lançamento
                </h2>
                
                <p className="text-center text-[14px] text-text-secondary sm:text-[14px] lg:text-[16px] xl:text-[16px] uppercase">
                    Nossos sistemas são desenvolvidos com base em engenharia, arquitetura <br className="hidden sm:block" />
                    e princípios de segurança
                </p>
            </div>
            
            <HowWorksCard></HowWorksCard>
        </section> 
    );   
}