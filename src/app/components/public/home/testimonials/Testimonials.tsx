import TestimonialsLogos from "./TestimonialsLogos";
import TestimonialsPersons from "./TestimonialsPersons";

export default function Testimonials(){
    return (
        <section className="w-full flex flex-col items-center gap-6 lg:gap-12">
            {/* Agrupamento textual indicativo */}
            <div  className="flex flex-col gap-4 items-center px-4">
                <span className="text-[14px] text-secondary font-medium">DEPOIMENTOS</span>
                <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold sm:text-[48px] 2xl:text-[56px]">MARCAS QUE DEFINEM SEU <br className="hidden sm:block" />FUTURO COM A TECFY</h2>
                <p className="text-center text-[14px] text-text-secondary sm:text-[14px] lg:text-[16px] xl:text-[16px]" >VEJA OQUE FALAM E VEJA AS EMPRESAS QUE DESENVOLVERAM E CONFIAM EM NÓS PARA <br className="hidden sm:block" />ELEVAR SUA PRESENÇA DIGITAL E SEU FUTURO.</p>
            </div>

            <TestimonialsLogos></TestimonialsLogos>

            <TestimonialsPersons></TestimonialsPersons>
        </section> 
    );
}