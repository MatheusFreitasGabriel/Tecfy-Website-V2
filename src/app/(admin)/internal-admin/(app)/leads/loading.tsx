import { ListSkeleton } from "@/app/components/admin/shared/Skeletons";

export default function Loading() {
  return <ListSkeleton label="leads" filters={4} />;
}
