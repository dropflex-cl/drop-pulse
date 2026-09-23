import { LoadingRegion, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <LoadingRegion label="Cargando la página del producto">
      <div className="flex h-topbar items-center gap-3 px-4 lg:hidden">
        <Skeleton className="size-6" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex flex-col gap-3 px-4 py-2 lg:max-w-content lg:px-8 lg:py-6">
        <Skeleton className="h-1.5 w-full rounded-full lg:hidden" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-control" />
          <Skeleton className="h-control" />
          <Skeleton className="h-control" />
        </div>
      </div>
    </LoadingRegion>
  );
}
