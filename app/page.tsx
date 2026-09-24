import type { Metadata } from "next";
import { Suspense } from "react";
import { LandingPage } from "@/components/landing/landing-page";
import { SignedInRedirect } from "@/components/shell/auth-gate";

export const metadata: Metadata = {
  title: { absolute: "DropFlex · Tus productos listos para vender" },
  description:
    "Conecta tu Shopify: la IA prepara textos, imágenes y anuncios para cada producto, y tú decides qué se publica. Para dropshipping con pago contra entrega.",
};

// `/`: la landing (design-system/landing.md). Con sesión, redirige a Hoy.
export default function Home() {
  return (
    <>
      <Suspense fallback={null}>
        <SignedInRedirect />
      </Suspense>
      <LandingPage />
    </>
  );
}
