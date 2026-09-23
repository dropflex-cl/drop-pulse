// Propuestas de texto de ejemplo. Las del Corrector de postura salen de bundle.js (ScreenRevision,
// ScreenDeskProducto) y de las previews de ReviewCard: 8 textos, 3 aceptados, la 4 es el título.
import type { ContentItem, ImageOption } from "@/lib/types";
import { productImage } from "./images";

export const CONTENT: ContentItem[] = [
  {
    id: "c-cp-1",
    productId: "corrector-de-postura",
    field: "Descripción corta",
    proposal: "Alivia la tensión de espalda y hombros. Ajuste con velcro, talla única.",
    status: "aprobado",
  },
  {
    id: "c-cp-2",
    productId: "corrector-de-postura",
    field: "Nombre para anuncios",
    original: "Corrector Postura",
    proposal: "Corrector de postura invisible",
    status: "aprobado",
  },
  {
    id: "c-cp-3",
    productId: "corrector-de-postura",
    field: "Frase de la oferta",
    proposal: "Paga al recibir y pruébalo en casa",
    status: "aprobado",
  },
  {
    id: "c-cp-4",
    productId: "corrector-de-postura",
    field: "Título del producto",
    original: "Corrector Postura Espalda Ajustable Unisex Hombre Mujer Talla Única",
    proposal: "Corrector de postura ajustable: espalda recta en 15 minutos al día",
    status: "revision",
    note: "Más corto, con el beneficio al frente. 62 caracteres.",
  },
  {
    id: "c-cp-5",
    productId: "corrector-de-postura",
    field: "Beneficio 1",
    original: "Material transpirable",
    proposal: "Tela transpirable que puedes usar bajo la ropa todo el día",
    status: "generado",
  },
  {
    id: "c-cp-6",
    productId: "corrector-de-postura",
    field: "Beneficio 2",
    original: "Ajustable",
    proposal: "Se ajusta en segundos con velcro: sirve para tallas S a XL",
    status: "generado",
  },
  {
    id: "c-cp-7",
    productId: "corrector-de-postura",
    field: "Garantía",
    proposal: "Si no te acomoda en 30 días, te devolvemos tu dinero.",
    status: "generado",
  },
  {
    id: "c-cp-8",
    productId: "corrector-de-postura",
    field: "Preguntas frecuentes",
    proposal: "¿Se nota bajo la ropa? No: es delgado y se ajusta al cuerpo. ¿Cuánto tiempo al día? Empieza con 15 minutos.",
    status: "generado",
  },
];

// Grilla de ScreenImagenes: 3 elegidas (la 1 es portada), 1 descartada, 2 generándose, 1 con error.
export const IMAGES: ImageOption[] = [
  { index: 1, status: "selected", order: 1 },
  { index: 3, status: "selected", order: 2 },
  { index: 0, status: "idle" },
  { index: 4, status: "selected", order: 3 },
  { index: 5, status: "discarded" },
  { index: 2, status: "idle" },
  { status: "generating" },
  { status: "generating" },
  { status: "error" },
].map((t, i) => ({
  id: `i-cp-${i + 1}`,
  productId: "corrector-de-postura",
  src: "index" in t && t.index != null ? productImage(t.index, 1) : undefined,
  alt: `Opción ${i + 1}`,
  status: t.status as ImageOption["status"],
  order: "order" in t ? t.order : undefined,
}));
