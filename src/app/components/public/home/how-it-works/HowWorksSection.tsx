import HowWorksScroll from "./HowWorksScroll";

export default function HowWorks({ id }: { id: string }) {
  return (
    <section id={id} className="w-full scroll-mt-34 bg-black">
      <HowWorksScroll />
    </section>
  );
}
