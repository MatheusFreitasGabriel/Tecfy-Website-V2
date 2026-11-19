import { ListSkeleton } from "@/app/components/admin/shared/Skeletons";

export default function Loading() {
  return <ListSkeleton label="empresas" filters={6} />;
}
