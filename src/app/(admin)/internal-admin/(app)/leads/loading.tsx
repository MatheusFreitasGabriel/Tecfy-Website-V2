import { LeadsSkeleton } from "@/app/components/admin/shared/Skeletons";

/** Aparece na hora ao abrir a tela de Leads, com o mesmo layout, enquanto os dados chegam. */
export default function Loading() {
  return <LeadsSkeleton />;
}
