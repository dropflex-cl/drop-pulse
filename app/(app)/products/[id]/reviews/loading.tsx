import { LoadingRegion, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <LoadingRegion label="Cargando las reseñas">
      <div className="flex h-topbar items-center gap-3 px-4 lg:hidden">
        <Skeleton className="size-6" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex flex-col gap-4 px-4 pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_--spacing(85)] lg:gap-7 lg:px-7 lg:pt-5">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-1.5 w-full rounded-full lg:hidden" />
          <Skeleton className="h-9 w-full lg:w-80" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="hidden flex-col gap-4 lg:flex">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    </LoadingRegion>
  );
}
