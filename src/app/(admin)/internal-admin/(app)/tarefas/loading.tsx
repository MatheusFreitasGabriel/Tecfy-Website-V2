import { ListSkeleton } from "@/app/components/admin/shared/Skeletons";

/** Aparece na hora ao abrir Tarefas, enquanto os dados chegam. */
export default function Loading() {
  return <ListSkeleton label="tarefas" filters={4} />;
}
