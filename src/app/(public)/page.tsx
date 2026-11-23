import HeroSection from "../components/public/home/HeroSection";
import HowWorks from "../components/public/home/how-it-works/HowWorksSection";
import Cases from "../components/public/home/cases/CasesSection";
import Plans from "../components/public/home/plans/Plans";
import Testimonials from "../components/public/home/testimonials/Testimonials";

/** Os planos vêm do painel: a página é regenerada ao publicar (revalidatePath) e, no máximo, a cada 5 min. */
export const revalidate = 300;

export default function Page() {
  return <div className="flex flex-col gap-[64px] lg:gap-[128px]">

    {/*Hero Section*/}
    <HeroSection id="hero"/>

    {/* Testimonials Section - MOVIDA PARA APÓS HERO */}
    <Testimonials id="testimonials"/>

    {/* How it works Section */}
    <HowWorks id="how-it-works"/>

    {/* Cases Section */}
    <Cases id="cases"/>

    {/* Plans and Prices Section */}
    <Plans id="prices"/>
  </div>
}