import TestimonialsLogos from "./TestimonialsLogos";
import TestimonialsPersons from "./TestimonialsPersons";

export default function Testimonials({id}: {id: string}){
    return (
        <section id={id} className="w-full flex flex-col items-center gap-6 lg:gap-12 scroll-mt-34">
            {/* Agrupamento textual indicativo */}
            <div className="flex flex-col gap-4 items-center px-4">
                <span className="text-[14px] text-secondary font-medium uppercase">
                    Depoimentos
                </span>
                
                <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold sm:text-[48px] 2xl:text-[56px] uppercase">
                    Marcas que definem seu <br className="hidden sm:block" />futuro com a Tecfy
                </h2>
                
                <p className="text-center text-[14px] text-text-secondary sm:text-[14px] lg:text-[16px] xl:text-[16px] uppercase">
                    Veja o que dizem sobre nós e conheça as empresas que confiam na Tecfy para <br className="hidden sm:block" />
                    elevar sua presença digital e seu futuro.
                </p>
            </div>

            <TestimonialsLogos></TestimonialsLogos>

            {/* <TestimonialsPersons></TestimonialsPersons> */}
        </section> 
    );
}