import HeroSection from "../components/public/home/HeroSection";
import HowWorks from "../components/public/home/how-it-works/HowWorksSection";
import Cases from "../components/public/home/cases/CasesSection";
import Plans from "../components/public/home/plans/Plans";
import Testimonials from "../components/public/home/testimonials/Testimonials";

export default function Page() {
  return <main className="flex flex-col gap-[128px] lg:gap-[256px]">

    {/*Hero Section*/}
    <HeroSection id="hero"/>

    {/* How it works Section */}
    <HowWorks id="how-it-works"/>

    {/* Cases Section */}
    <Cases id="cases"/>

    {/* Plans and Prices Section */}
    <Plans id="prices"/>

    {/* Testimonials Section */}
    <Testimonials id="testimonials"/>
  </main>;
}