import { DetailSkeleton } from "@/app/components/admin/shared/Skeletons";

/** Aparece na hora ao abrir uma negociação, enquanto os dados chegam. */
export default function Loading() {
  return <DetailSkeleton label="negociação" />;
}
