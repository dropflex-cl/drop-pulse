# Landing de DropFlex

La página de marketing para dropshippers con pago contra entrega en LATAM. Sigue **AIDA** y usa el mismo sistema que la app: blanco, un solo acento, Geist y, como prueba, piezas reales de la app en vez de ilustraciones.

## Estructura AIDA

| Etapa | Sección | Qué hace | Componentes |
|---|---|---|---|
| **Atención** | Hero | Promesa en una frase ("Tus productos listos para vender, sin pasar días preparándolos"), para quién es (pago contra entrega), la acción y tres garantías cortas. A la derecha, la pantalla Hoy real | `LpNav`, `type-hero`, `Button`, `AttentionItem` |
| **Interés** | El problema | Cuatro dolores en palabras del dropshipper: textos del proveedor, fotos que no venden, precio a ojo, anuncios que queman plata | `LpSectionHead`, `LpPain` |
| **Interés** | Cómo funciona | Cuatro pasos (conectar → la IA elige cómo venderlo → tú apruebas → el motor vigila), cada uno con la pieza de la app que lo hace | `LpStep` + `ConnectionCard`, `AngleCard`, `ReviewCard`, `DecisionRow` |
| **Deseo** | Beneficios | Cuatro resultados con su prueba: ganancia por venta, anuncios que se cuidan solos, nada se publica sin tu OK, costo de IA a la vista | `LpFeature` + `PriceBreakdown`, `RuleGroup`, `StatusBadge`, `AiCostCard` |
| **Deseo** | Preguntas | Seis objeciones respondidas, incluida "¿La IA inventa reseñas?" | `LpFaq` |
| **Acción** | Cierre | "Conecta tu tienda y revisa tu primer producto mejorado hoy", tiempo estimado y la garantía de control | `LpCta` |

En móvil, un botón fijo "Conectar mi tienda" acompaña todo el recorrido.

## Reglas de contenido

- **Voz de la app:** español neutro con tuteo, frases cortas, verbo primero en los botones, sin signos de exclamación.
- **Una sola acción:** "Conectar mi tienda" en `primary` (nav, hero, móvil fijo, cierre). "Ver cómo funciona" es `ghost` y ancla a la sección.
- **Nada inventado:** sin cifras de resultados, logos de clientes, testimonios ni conteos de usuarios que no existan. Cuando haya testimonios reales (con nombre, tienda y permiso), se agregan como sección de Deseo, entre Beneficios y Preguntas.
- **Sin urgencia falsa** ni precios hasta que existan planes definidos. Si hay prueba gratis, se agrega a la letra chica del cierre y del hero.
- **Las demos son datos de ejemplo** del Corrector de postura, marcados `aria-hidden`: ilustran, no prometen resultados.

## Tipografía de marketing

Nuevo grupo "Marketing" en `tokens.json`, solo para la landing: `type-hero` (56/60 escritorio), `type-hero-sm` (36/40 móvil), `type-section` (32/38) y `type-lead` (18/28).

## Layout

- Móvil 390px: una columna, márgenes de 16px, secciones de 48px de alto de aire.
- Escritorio 1440px: márgenes de 80px, hero en dos columnas, pasos y beneficios en 2 columnas, dolores en 4.
- Secciones alternan `background` y `muted` para separar etapas sin líneas; el cierre usa `foreground` como fondo.
