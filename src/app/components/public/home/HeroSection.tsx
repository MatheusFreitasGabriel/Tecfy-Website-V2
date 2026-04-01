import Image from "next/image";
import BtnCta from "../../ui/BtnCta";

export default function HeroSection({id}: {id: string}) {
  return (
    <section id={id} className="relative h-screen w-full flex items-center justify-center bg-black scroll-mt-34">
      
      {/* Imagem de fundo */}
      <Image
        className="absolute inset-0 w-full h-full object-cover object-top select-none pointer-events-none"
        src="/assets/images/hero-background.webp"
        alt="Imagem de fundo"
        fill
        unoptimized
        priority
      />

      {/* Div wrapper */}
      <div className="relative flex flex-col items-center gap-6 2xl:gap-12 ">

        {/* Agrupamento de conteudo textual */}
        <div className="flex flex-col gap-6 px-3 items-center">
          <p className=" text-center text-[14px] text-text-primary sm:text-[14px] lg:text-[16px] xl:text-[16px]">
              EXELÊNCIA NA CRIAÇÃO DE <br className="hidden sm:block" />
              WEBSITES, APLICATIVOS, SOFTWARES E INTELIGÊNCIA ARTIFICIAL.
          </p>

          <h1 className="
              relative
              font-semibold
              leading-none
              text-center
              text-[52px]
              sm:text-[92px]
              lg:text-[102px]
              2xl:text-[128px]
              mix-blend-difference
          ">
              TECNOLOGIA <br/>
              TRANSFORMA <br/>
              FUTURO
          </h1>
          <p className="text-center text-text-primary text-[14px] sm:text-[14px] lg:text-[16px] xl:text-[16px]">
              AQUI AS IDEIAS SE TRANSFORMAM EM REALIDADE COM <br className="hidden sm:block" />
              QUALIDADE, SEGURANÇA, ARQUITETURA E RAPIDEZ
          </p>
        </div>

        {/* Botão de redirecionamento para contato */}
        <BtnCta/>
      </div>
      
    </section>
  );
}
