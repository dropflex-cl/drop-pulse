import { HeaderSkeleton, LoadingRegion, RowsSkeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <LoadingRegion label="Cargando tus productos de upsell">
      <HeaderSkeleton back />
      <div className="flex flex-col gap-3 pt-2 lg:max-w-content lg:px-8 lg:py-6">
        <RowsSkeleton rows={3} />
      </div>
    </LoadingRegion>
  );
}
