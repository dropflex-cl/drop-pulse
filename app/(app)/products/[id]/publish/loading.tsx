import { LoadingRegion, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <LoadingRegion label="Cargando la publicación">
      <div className="flex h-topbar items-center gap-3 px-4 lg:hidden">
        <Skeleton className="size-6" />
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="flex flex-col gap-4 px-4 lg:grid lg:grid-cols-2 lg:px-8 lg:py-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </LoadingRegion>
  );
}
