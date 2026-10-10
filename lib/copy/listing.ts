// La ficha del producto: los campos nativos de Shopify que escribe la etapa Página del producto
// (docs/spec-pagina-componentes.md). Un solo esquema para el prompt, la validación y el editor: el
// límite que ve el comerciante es el mismo que valida el código. Puro.

import * as z from "zod/v4";
import { ICON_KEYS } from "@/lib/shopify/components/define";

/** Id de la ficha en page_components (los componentes usan su id del catálogo). */
export const LISTING = "listing";

const plain = (field: string) =>
  z
    .string()
    .refine((s) => !/[<>*#]/.test(s), {
      message: `${field}: texto plano, sin HTML ni markdown`,
    });

export const listingSchema = z.object({
  title: plain("title")
    .pipe(z.string().min(10).max(70))
    .describe(
      "Título del producto: qué es y el resultado o el dolor que resuelve, desde el DIFERENCIADOR (la página es común a los ángulos). Sin mayúsculas sostenidas ni palabras sueltas de SEO.",
    ),
  short_name: plain("short_name")
    .pipe(z.string().min(3).max(30))
    .describe(
      "Cómo se llama el producto en una etiqueta, un anuncio o el carrito. Ej.: «Corrector de postura».",
    ),
  short_description: plain("short_description")
    .pipe(z.string().min(40).max(160))
    .describe(
      "Una o dos frases bajo el título: el resultado y el dato que lo sostiene.",
    ),
  gallery_benefits: z
    .array(
      z.object({
        icon: z
          .enum(ICON_KEYS)
          .describe("Ícono que representa este beneficio del producto."),
        text: plain("gallery_benefits.text")
          .pipe(z.string().trim().min(3).max(42))
          .describe(
            "Beneficio principal del producto en una frase corta, legible bajo el botón de compra. Ej.: «Se ajusta a tu cuerpo». Sin precios ni políticas de la tienda.",
          ),
      }),
    )
    .min(3)
    .max(3)
    .refine(
      (items) =>
        new Set(items.map((item) => item.text.toLocaleLowerCase())).size === 3,
      { message: "gallery_benefits: los tres beneficios deben ser distintos" },
    )
    .optional()
    .describe(
      "Tres beneficios principales, distintos y respaldados por los hechos del producto, en orden de importancia. Se muestran bajo el botón de compra con el acento del producto. Inclúyelos al crear la ficha; opcional para conservar fichas anteriores.",
    ),
  offer_line: plain("offer_line")
    .pipe(z.string().min(10).max(90))
    .describe(
      "Bajo el precio: la oferta principal con su número exacto de PRECIO Y OFERTA y el cierre. Ej.: «2 por $39.990 · Paga al recibir».",
    ),
  seo_title: plain("seo_title")
    .pipe(z.string().min(15).max(60))
    .describe(
      "Título para Google: lo que busca el comprador, qué es + su uso principal.",
    ),
  seo_description: plain("seo_description")
    .pipe(z.string().min(50).max(155))
    .describe(
      "Descripción para Google: qué es, el beneficio principal y el pago contra entrega.",
    ),
});

export type Listing = z.infer<typeof listingSchema>;

/** Nombres de los campos en la pantalla, en el orden del editor. */
export const LISTING_FIELDS: Record<keyof Listing, string> = {
  title: "Título del producto",
  short_name: "Nombre corto",
  short_description: "Descripción corta",
  gallery_benefits: "Beneficios principales del producto",
  offer_line: "Frase de la oferta",
  seo_title: "Título para Google",
  seo_description: "Descripción para Google",
};

/** Cómo se describe la ficha en el prompt y en la pantalla. */
export const LISTING_INFO = {
  name: "Ficha del producto",
  placement:
    "Tres beneficios principales bajo el botón de compra; título y bajada arriba del precio; textos para Google.",
  objection: "¿Qué es, sirve para lo que necesito y cuánto me cuesta?",
};
