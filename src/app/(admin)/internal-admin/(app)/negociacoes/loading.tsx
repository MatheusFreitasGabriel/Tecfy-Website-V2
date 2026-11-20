import { KanbanSkeleton } from "@/app/components/admin/shared/Skeletons";

/** Aparece na hora ao abrir Negociações, com o formato do Kanban, enquanto os dados chegam. */
export default function Loading() {
  return <KanbanSkeleton />;
}
