"use client";

import { useState } from "react";
import { Button, Field, SegmentedControl, notify, notifyUndo } from "@/components/df";
import { ImagePicker } from "@/components/screens/image-picker";
import { ReviewFlow } from "@/components/screens/review-flow";
import { productImage } from "@/lib/mock/images";
import type { ContentItem, ImageOption } from "@/lib/types";

export function SegmentedDemo() {
  const [a, setA] = useState("det");
  const [b, setB] = useState("7");
  return (
    <div className="flex max-w-95 flex-col gap-3">
      <SegmentedControl
        block
        value={a}
        onChange={setA}
        label="Filtrar productos"
        options={[
          { value: "avz", label: "Avanzan", count: 9 },
          { value: "det", label: "Detenidos", count: 3 },
          { value: "pub", label: "Publicados", count: 12 },
        ]}
      />
      <div>
        <SegmentedControl
          value={b}
          onChange={setB}
          label="Periodo"
          options={[
            { value: "hoy", label: "Hoy" },
            { value: "7", label: "7 días" },
            { value: "30", label: "30 días" },
          ]}
        />
      </div>
    </div>
  );
}

export function FieldDemo() {
  return (
    <div className="grid max-w-105 grid-cols-2 gap-4">
      <Field label="Precio de venta" prefix="$" defaultValue="24.990" />
      <Field label="Costo del producto" prefix="$" defaultValue="6.900" hint="Del proveedor" />
      <Field label="Precio tachado" prefix="$" defaultValue="19.990" error="Debe ser mayor que el precio de venta" />
      <Field label="Publicidad por venta" prefix="$" defaultValue="6.000" ai hint="Estimado por la IA" />
      <Field label="Envío" prefix="$" defaultValue="3.500" disabled hint="Tarifa fija de tu transportista" />
      <Field label="Tasa de entrega" suffix="%" defaultValue="80" inputMode="numeric" />
    </div>
  );
}

const REVIEW: ContentItem[] = [
  {
    id: "t1",
    productId: "demo",
    field: "Título del producto",
    original: "Corrector Postura Espalda Ajustable Unisex Hombre Mujer Talla Única",
    proposal: "Corrector de postura ajustable: espalda recta en 15 minutos al día",
    status: "revision",
    note: "Más corto, con el beneficio al frente. 62 caracteres.",
  },
  { id: "t2", productId: "demo", field: "Descripción corta", proposal: "Alivia la tensión de espalda y hombros. Ajuste con velcro, talla única.", status: "generado" },
  { id: "t3", productId: "demo", field: "Beneficio 1", original: "Material transpirable", proposal: "Tela transpirable que puedes usar bajo la ropa todo el día", status: "generado" },
];

const IMAGES: ImageOption[] = [
  { id: "i1", productId: "demo", src: productImage(1, 1), alt: "Opción 1", status: "selected", order: 1 },
  { id: "i2", productId: "demo", src: productImage(3, 1), alt: "Opción 2", status: "selected", order: 2 },
  { id: "i3", productId: "demo", src: productImage(0, 1), alt: "Opción 3", status: "idle" },
  { id: "i4", productId: "demo", src: productImage(4, 1), alt: "Opción 4", status: "selected", order: 3 },
  { id: "i5", productId: "demo", src: productImage(5, 1), alt: "Opción 5", status: "discarded" },
  { id: "i6", productId: "demo", src: productImage(2, 1), alt: "Opción 6", status: "idle" },
  { id: "i7", productId: "demo", alt: "Opción 7", status: "generating" },
  { id: "i8", productId: "demo", alt: "Opción 8", status: "generating" },
  { id: "i9", productId: "demo", alt: "Opción 9", status: "error" },
];

type Demo = "revision" | "imagenes";

/** Las piezas interactivas, una a la vez (cada una tiene su barra fija de acción). */
export function InteractiveDemo() {
  const [demo, setDemo] = useState<Demo>("revision");
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="Demo interactiva"
        value={demo}
        onChange={(v) => setDemo(v as Demo)}
        options={[
          { value: "revision", label: "Revisión" },
          { value: "imagenes", label: "Imágenes" },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => notify("Cliente ideal aprobado")}>Toast simple</Button>
        <Button size="sm" onClick={() => notifyUndo("Imagen descartada", () => notify("Imagen recuperada"))}>Toast con Deshacer</Button>
      </div>
      {demo === "revision" ? <ReviewFlow items={REVIEW} nextHref="#" nextLabel="Continuar: Imágenes" /> : null}
      {demo === "imagenes" ? <ImagePicker images={IMAGES} onApprove={(ids) => notify(`${ids.length} imágenes aprobadas`)} /> : null}
    </div>
  );
}
