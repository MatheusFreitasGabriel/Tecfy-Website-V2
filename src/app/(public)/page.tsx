import HeroSection from "../components/public/home/HeroSection";
import HowWorks from "../components/public/home/how-it-works/HowWorksSection";
import Cases from "../components/public/home/cases/CasesSection";
import Plans from "../components/public/home/plans/Plans";
import Testimonials from "../components/public/home/Testimonials";

export default function Page() {
  return <main className="flex flex-col gap-[128px] lg:gap-[256px]">

    {/*Hero Section*/}
    <HeroSection></HeroSection>

    {/* How it works Section */}
    <HowWorks></HowWorks>

    {/* Cases Section */}
    <Cases></Cases>

    {/* Plans and Prices Section */}
    <Plans></Plans>

    {/* Testimonials Section */}
    <Testimonials></Testimonials>
  </main>;
}