import Image from "next/image";

type Logos = {
  image: string;
  alt: string;
};

const logosData: Logos[] = [
  { image: "/assets/logos-company/logo-braziflon.png", alt: "Logo da empresa Braziflon" },
  { image: "/assets/logos-company/logo-newpower.png", alt: "Logo da empresa New Power" },
  { image: "/assets/logos-company/logo-gtown.png", alt: "Logo da empresa Gtown" },
  { image: "/assets/logos-company/logo-rankee.png", alt: "Logo da empresa Rankee" },
  { image: "/assets/logos-company/logo-danillo.png", alt: "Logo de Danillo Leao" }
];

export default function TestimonialsLogos() {
  const baseLogos = [...logosData, ...logosData, ...logosData, ...logosData];
  
  const logos = [...baseLogos, ...baseLogos];

  return (
    <div className="relative w-full overflow-hidden">

      <div className="pointer-events-none absolute left-0 top-0 h-full w-52 bg-linear-to-r from-background to-transparent z-10" />

      <div className="pointer-events-none absolute right-0 top-0 h-full w-52 bg-linear-to-l from-background to-transparent z-10" />

      <div className="flex gap-16 pr-32 md:gap-60 md:pr-60 w-max animate-marquee">
        {logos.map((logo, index) => (
          <div key={`${logo.alt}-${index}`} className="relative w-36 h-12 shrink-0">
            <Image
              src={logo.image}
              alt={logo.alt}
              fill
              className="object-contain opacity-20"
            />
          </div>
        ))}
      </div>

    </div>
  );
}