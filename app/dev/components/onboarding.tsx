"use client";

import { useState } from "react";
import {
  Button,
  ConnectionCard,
  GenerationProgress,
  OnboardingHeader,
  OptionList,
  PermissionList,
  PickRow,
  SetupChecklist,
} from "@/components/df";
import { productImage } from "@/lib/mock/images";
import { Section } from "./section";

// Mismos datos que design-system/reference/<Componente>/preview.html.
export function OnboardingDemos() {
  const [acc, setAcc] = useState("a1");
  const [picks, setPicks] = useState({ a: true, b: false, c: false });
  return (
    <>
      <Section id="onboarding-header" title="OnboardingHeader">
        <div className="max-w-97.5 overflow-hidden rounded-xl border">
          <OnboardingHeader step={2} total={4} optionalSteps={[4]} back="Volver" skip="Usar sugeridos" title="Elige con qué empezar" desc="Te recomendamos los que más venden y más pueden mejorar." />
        </div>
      </Section>
      <Section id="connection-card" title="ConnectionCard">
        <div className="grid items-start gap-3 md:grid-cols-2">
          <ConnectionCard provider="shopify" state="idle" />
          <ConnectionCard provider="shopify" state="connecting" account="mitienda.myshopify.com" detail="Esperando tu autorización en Shopify" />
          <ConnectionCard provider="shopify" state="importing" account="mitienda.myshopify.com" progress={0.67} detail="86 de 128 productos importados" />
          <ConnectionCard provider="shopify" state="connected" account="mitienda.myshopify.com" facts={[["Productos", "128"], ["Moneda", "CLP"]]} />
          <ConnectionCard provider="meta" state="action" account="Business Manager: Mi Tienda" detail="Elige cuenta publicitaria, página y píxel para terminar." actions={<Button size="sm" variant="primary">Elegir</Button>} />
          <ConnectionCard provider="meta" state="error" account="Mi Tienda CL" detail="Meta venció el permiso. Vuelve a conectar para seguir viendo tus campañas." actions={<Button size="sm">Volver a conectar</Button>} />
          <ConnectionCard provider="meta" state="later" account="Conéctala cuando quieras anunciar" actions={<Button size="sm">Conectar</Button>} />
        </div>
      </Section>
      <Section id="permission-list" title="PermissionList">
        <div className="max-w-97.5">
          <PermissionList
            title="Qué hará DropFlex con tu tienda"
            items={[
              { kind: "read", text: "Productos, variantes, imágenes y precios" },
              { kind: "read", text: "Pedidos, para saber qué se vende y cuánto se entrega" },
              { kind: "write", text: "Productos: solo lo que tú apruebes" },
              { kind: "never", text: "Datos de pago ni clientes fuera de tus pedidos" },
            ]}
            note="Puedes desconectar en cualquier momento."
          />
        </div>
      </Section>
      <Section id="option-list" title="OptionList">
        <div className="max-w-97.5">
          <OptionList
            label="Cuenta publicitaria"
            name="demo-acc"
            value={acc}
            onChange={setAcc}
            options={[
              { value: "a1", title: "Mi Tienda", meta: "CLP · activa", tag: "Sugerida", id: "1043587720913", details: ["Tiendas SpA", "America/Santiago", "Gastado $1.250.000"] },
              { value: "a3", title: "Mi Tienda", meta: "USD · activa", id: "2208841157302", details: ["Cuenta personal", "America/Lima", "Sin gasto aún"] },
              { value: "a2", title: "Pruebas 2025", meta: "Deshabilitada por Meta", tone: "danger", disabled: true, id: "871204456120", details: ["Tiendas SpA"] },
            ]}
          />
        </div>
      </Section>
      <Section id="pick-row" title="PickRow">
        <div className="max-w-105 overflow-hidden rounded-lg border bg-card">
          <PickRow name="Corrector de postura" image={productImage(1)} meta="$24.990 · 41 ventas en 30 días" issues={["Sin descripción", "2 imágenes"]} score="Alta" checked={picks.a} onCheckedChange={(a) => setPicks((p) => ({ ...p, a }))} />
          <PickRow name="Botella térmica 1L" image={productImage(0)} meta="$14.990 · 9 ventas" issues={["Imágenes con texto chino"]} score="Media" checked={picks.b} onCheckedChange={(b) => setPicks((p) => ({ ...p, b }))} />
          <PickRow name="Organizador de cables" image={productImage(3)} meta="$9.990 · 2 ventas" score="Baja" checked={picks.c} onCheckedChange={(c) => setPicks((p) => ({ ...p, c }))} />
        </div>
      </Section>
      <Section id="generation-progress" title="GenerationProgress">
        <div className="grid items-start gap-4 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <GenerationProgress
              eta="unos 2 min"
              items={[
                { name: "Corrector de postura", image: productImage(1), status: "generado", detail: "8 textos · 6 imágenes" },
                { name: "Lámpara lunar 3D", image: productImage(2), status: "publicando", detail: "Escribiendo textos" },
                { name: "Botella térmica 1L", image: productImage(0), status: "cola", detail: "Empieza en ~1 min" },
                { name: "Masajeador de cuello", image: productImage(4), status: "error", detail: "No pudimos leer las imágenes" },
              ]}
            />
          </div>
          <div className="rounded-lg border bg-card p-4">
            <GenerationProgress compact eta="unos 3 min" items={[{ name: "a", status: "generado" }, { name: "b", status: "publicando" }, { name: "c", status: "cola" }]} />
          </div>
        </div>
      </Section>
      <Section id="setup-checklist" title="SetupChecklist">
        <div className="max-w-97.5">
          <SetupChecklist
            onHide={() => {}}
            items={[
              { title: "Conectar Shopify", done: true },
              { title: "Elegir productos", done: true },
              { title: "Definir tus números", done: true },
              { title: "Conectar Meta Ads", desc: "Para lanzar y vigilar anuncios", action: "Conectar" },
            ]}
          />
        </div>
      </Section>
    </>
  );
}
