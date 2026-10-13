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
      "Nombre visible del producto (H1 y título nativo de Shopify): qué es, marca o modelo y cantidad del pack cuando corresponda. Breve y reconocible; apunta a 35–55 caracteres, máximo compatible de 70. Sin slogan, dolor, promesa añadida tras una barra ni palabras de SEO. Desarrolla el beneficio del hook en short_description; seo_title es independiente.",
    ),
  short_name: plain("short_name")
    .pipe(z.string().min(3).max(30))
    .describe(
      "Cómo se llama el producto en una etiqueta, un anuncio o el carrito. Ej.: «Corrector de postura».",
    ),
  short_description: plain("short_description")
    .pipe(z.string().min(40).max(160))
    .describe(
      "Bajada separada del nombre: una sola frase breve con el beneficio principal del hook y un dato concreto del producto. Apunta a 40–120 caracteres; máximo compatible de 160. No repitas el título ni los tres gallery_benefits. Sin HTML ni una introducción larga en forma de pregunta.",
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
            "Beneficio principal del producto en una frase corta, legible antes de los packs. Ej.: «Se ajusta a tu cuerpo». Sin precios ni políticas de la tienda.",
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
      "Tres beneficios principales, distintos y respaldados por los hechos del producto, en orden de importancia. Se muestran antes del selector de packs con el acento del producto. Inclúyelos al crear la ficha; opcional para conservar fichas anteriores.",
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

/** Reglas compartidas por catálogo MCP, lectura y contexto de generación. */
export const LISTING_RULES = [
  "title identifica el producto: tipo, marca o modelo y cantidad del pack cuando corresponda. Es el H1 y el título nativo de Shopify. Prefiere 35–55 caracteres; el máximo compatible sigue siendo 70. No añadas slogans, dolor ni una promesa después de una barra.",
  "short_description desarrolla el beneficio principal del hook en una sola frase y con un dato concreto. Prefiere 40–120 caracteres; el máximo compatible sigue siendo 160. No repitas title ni gallery_benefits.",
  "short_name es la etiqueta breve para anuncios, carrito y otros apoyos; no sustituye el H1. seo_title y seo_description son los campos independientes para Google.",
  "Texto plano. La frase de oferta usa el precio real y cierra con el pago al recibir.",
  "Al crear la ficha, escribe gallery_benefits: los tres beneficios principales del producto, en orden de importancia, cada uno con icon y text (hasta 42 caracteres). Usa get_product_context/get_product_strategy.",
  "Son beneficios del producto, no envío, pago, garantías ni descuentos de la tienda. Cada variante de listing puede tener sus propios beneficios; la tienda aplica el acento del producto.",
  "Lee el listing vigente antes de editar y conserva los demás campos, variantes por ángulo/hook, imágenes omitidas, selección, orden y visibilidad. Cambiar estas instrucciones no reescribe ni invalida el contenido existente; guardar no publica.",
];

/** Cómo se describe la ficha en el prompt y en la pantalla. */
export const LISTING_INFO = {
  name: "Ficha del producto",
  placement:
    "Nombre breve del producto como H1, beneficio del hook en la bajada y precio operativo; tres beneficios de apoyo y textos independientes para Google.",
  objection: "¿Qué es, sirve para lo que necesito y cuánto me cuesta?",
};
