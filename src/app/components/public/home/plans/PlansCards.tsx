"use client";

import { useRouter } from "next/navigation";
import type { SiteSection } from "@/lib/admin/crm/options";
import type { SitePlan } from "@/lib/site/plans";
import PlanCard from "./PlanCard";

type Props = {
  type: SiteSection;
  plans: SitePlan[];
  now: number;
  /** Prévia no painel: os botões não navegam. */
  preview?: boolean;
};

export default function PlansCards({ type, plans, now, preview }: Props) {
  const router = useRouter();
  const filteredPlans = plans.filter((plan) => plan.section === type);

  const containerClasses =
    type === "monthly"
      ? "w-full flex flex-row gap-4 overflow-x-auto snap-x snap-mandatory pb-4 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 lg:grid-cols-4 flex-1"
      : "w-full flex flex-col lg:flex-row gap-4 md:gap-6 justify-center flex-1";

  function handleClick(planName: string) {
    if (!preview) router.push(`/contato?plan=${encodeURIComponent(planName)}`);
  }

  return (
    <div className="w-full flex flex-col lg:flex-row gap-6 items-stretch">
      <div className={containerClasses}>
        {filteredPlans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} now={now} onSelect={handleClick} preview={preview} />
        ))}
      </div>
    </div>
  );
}
