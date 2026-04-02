import Image from "next/image"
import BtnCta from "../../ui/BtnCta"

export default function Cta(){
    return(
        <section className="relative w-full px-6 py-32 lg:px-48 lg:py-48 2xl:py-64 overflow-hidden flex justify-center">
            <Image
                src="/assets/images/cta-background.webp"
                alt="imagem de ondas roxo e laranja"
                className="object-cover -z-10"
                fill
                unoptimized
            />
            <div className="relative z-10 max-w-[1440px] flex flex-col items-center gap-6 lg:gap-12">
                <h2 className="leading-none text-[36px] text-text-primary text-center font-semibold sm:text-[48px] 2xl:text-[56px] uppercase">
                    Escolha a Tecfy para impulsionar o futuro da sua empresa.
                </h2>
                <BtnCta></BtnCta>
            </div>
        </section>
    )
}