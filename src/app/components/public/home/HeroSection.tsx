import Image from "next/image";
import BtnCta from "../../ui/BtnCta";

export default function HeroSection({ id }: { id: string }) {
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
          <p
            className="hero-fade uppercase text-center text-[14px] text-text-primary sm:text-[14px] lg:text-[16px] xl:text-[16px]"
            style={{ animationDelay: "0.1s" }}
          >
              Excelência na criação de <br className="hidden sm:block" />
              Websites, Aplicativos, Softwares e Inteligência Artificial.
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
              uppercase
          ">
              <span className="hero-title-line" style={{ animationDelay: "0.3s" }}>Tecnologia</span>
              <span className="hero-title-line" style={{ animationDelay: "0.45s" }}>Transforma</span>
              <span className="hero-title-line" style={{ animationDelay: "0.6s" }}>Futuro</span>
          </h1>

          <p
            className="hero-fade text-center text-text-primary text-[14px] sm:text-[14px] lg:text-[16px] xl:text-[16px] uppercase"
            style={{ animationDelay: "0.85s" }}
          >
            Aqui as ideias se transformam em realidade com <br className="hidden sm:block" />
            qualidade, segurança, arquitetura e rapidez
          </p>
        </div>

        {/* Botão de redirecionamento para contato */}
        <div className="hero-fade" style={{ animationDelay: "1s" }}>
          <BtnCta/>
        </div>
      </div>

    </section>
  );
}
