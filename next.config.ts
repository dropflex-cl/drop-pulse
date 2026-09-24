import type { NextConfig } from "next";

// Rutas anteriores en español → rutas en inglés (CLAUDE.md › Rutas). Permanentes, para enlaces y marcadores viejos.
const LEGACY_ROUTES: [string, string][] = [
  ["/hoy", "/today"],
  ["/productos/:id/resenas", "/products/:id/reviews"],
  ["/productos/:id/textos", "/products/:id/copy"],
  ["/productos/:id/imagenes", "/products/:id/images"],
  // La etapa Precio se unió a Información base (“Precio y packs”).
  ["/productos/:id/precio", "/products/:id/base"],
  ["/products/:id/price", "/products/:id/base"],
  ["/productos/:id", "/products/:id"],
  ["/productos", "/products"],
  ["/campanas/:id", "/campaigns/:id"],
  ["/campanas", "/campaigns"],
  ["/ajustes", "/settings"],
  ["/auth/crear-cuenta", "/auth/create-account"],
  ["/onboarding/productos", "/onboarding/products"],
  ["/onboarding/numeros", "/onboarding/numbers"],
  ["/onboarding/meta/cuentas", "/onboarding/meta/accounts"],
  ["/onboarding/listo", "/onboarding/done"],
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  devIndicators: false,
  // El tema de DropFlex se lee del disco al instalarlo o actualizarlo (lib/shopify/publish/kit.ts):
  // sin esto no entra al bundle de la función en Vercel (spec del tema §4.5).
  outputFileTracingIncludes: {
    "/api/shopify/theme": ["./lib/shopify/themes/DropPulse/**/*"],
    "/api/products/[id]/publish": ["./lib/shopify/themes/DropPulse/**/*"],
    "/products/[id]/publish": ["./lib/shopify/themes/DropPulse/**/*"],
  },
  async redirects() {
    return LEGACY_ROUTES.map(([source, destination]) => ({ source, destination, permanent: true }));
  },
};

export default nextConfig;
