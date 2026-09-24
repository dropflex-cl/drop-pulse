import { LoadingRegion, Skeleton } from "@/components/shell/skeletons";

export default function Loading() {
  return (
    <LoadingRegion label="Cargando los creativos">
      <div className="flex h-topbar items-center gap-3 px-4 lg:hidden">
        <Skeleton className="size-6" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex flex-col gap-3 px-4 py-2 lg:px-8 lg:py-6">
        <Skeleton className="h-4 w-32" />
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    </LoadingRegion>
  );
}
