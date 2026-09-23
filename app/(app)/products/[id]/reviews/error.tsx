"use client";

import { RouteError } from "@/components/shell/route-error";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="No pudimos abrir las reseñas"
      description="Puede ser tu conexión. Lo que ya aprobaste está guardado; reintenta en un momento."
      backHref="/products"
      backLabel="Ver productos"
    />
  );
}
