"use client";

import { RouteError } from "@/components/shell/route-error";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <RouteError
      error={error}
      reset={reset}
      title="No pudimos cargar tus eventos"
      description="Puede ser tu conexión. Tu tienda sigue igual; reintenta en un momento."
    />
  );
}
