> Textos y acciones de las pantallas actuales: [Contenido preparado desde el chat](chat-authored-content.md). Sustituye la redacción pagada de los ejemplos anteriores; render y revisión visual opcional se conservan.

DropFlex ayuda a comerciantes de dropshipping con pago contra entrega a llevar productos de cero a publicados: la IA genera textos, imágenes y anuncios, y el comerciante decide. Esta interfaz es para alguien que maneja muchos productos desde el teléfono, en ratos de dos minutos, y necesita saber en segundos qué le toca decidir.

## Principios

1. **Primero lo que te toca.** Cada pantalla responde “¿qué tengo que decidir aquí?” antes que “¿qué hay aquí?”. Lo que bloquea ventas o gasta dinero va arriba; lo que avanza solo, abajo o escondido.
2. **La IA propone, tú decides.** Todo lo generado entra como `generado` y solo cambia de estado por una acción tuya. El destello (`sparkle`) marca siempre lo que hizo la IA; nunca decora.
3. **Decidir rápido y deshacer fácil.** Aceptar, descartar y elegir son un toque, sin diálogos de confirmación. Lo reversible se confirma con `Toast` y “Deshacer”; solo lo que cuesta dinero (apagar o subir una campaña) pide un segundo toque.
4. **Una cifra con su porqué.** Ningún número aparece solo: va con su referencia (“Límite $6.000”) y una frase que dice qué significa. Las recomendaciones se escriben como acción (“Sube el presupuesto”), no como diagnóstico.
5. **Retomar donde quedaste.** Cada producto recuerda su etapa; “Continuar: <etapa>” siempre lleva al siguiente paso pendiente.
6. **El estado se ve sin leer, y se entiende al leer.** Color + ícono + palabra en cada estado. El color nunca es la única señal.
7. **Un solo acento, para actuar.** `primary` (azul cobalto) marca lo que se puede tocar y la acción principal. Los estados usan su propia familia (`success`, `warning`, `destructive`) y nunca el acento.

## El acento: azul cobalto

`primary` es `#1f4bd8` en claro y `#8aa4ff` en oscuro. Por qué este y no otro:

- **Es el único matiz libre.** En DropFlex el verde ya significa aprobado, publicado y ganancia; el ámbar, revisión y atención; el rojo, error y pérdida. Un acento verde o naranja haría dudar si un botón es una acción o un estado. El azul no compite con ninguno.
- **Dinero y confianza.** El comerciante mueve plata real (costos, presupuestos de anuncios). Un azul sobrio se lee como herramienta seria, no como juguete, y deja que el verde de la ganancia sea la única cifra que resalta.
- **Se ve al sol.** El usuario trabaja en el teléfono en cualquier parte. El cobalto da 6,9:1 sobre blanco (pasa AA para texto normal con margen) y conserva su tono al bajar el brillo; evitamos el azul violáceo típico de “producto IA”.
- **En oscuro se aclara** (`#8aa4ff`, 8:1 sobre `background`) y su texto encima pasa a tinta oscura (`primary-foreground`), no blanco.

## Contenido y voz

- Español neutro con tuteo, sin voseo: “Revisa”, “Elige”, “Tienes 6 decisiones”. Nunca “Revisá”, “Elegí” ni “usted”.
- Frases cortas, verbo primero en botones: “Aceptar”, “Continuar: Imágenes”, “Subir a $15.000”. Sin signos de exclamación ni emojis.
- Minúscula inicial después de la primera palabra (sentence case): “Precio y oferta”, no “Precio Y Oferta”.
- Cifras con punto de miles y signo pegado: `$24.990`, `−$1.200`, `34%`, `2,6×`. Siempre con `tabular-nums`.
- Estados detenidos dicen qué falta y desde cuándo: “Detenido: falta el precio · 3 días”.
- Errores dicen qué pasó y qué hacer: “Shopify rechazó 2 imágenes por tamaño” + “Reintentar”. Nunca “Algo salió mal”.
- Las recomendaciones de campaña citan la cifra que las justifica y la comparan con el límite del comerciante: “CPA $4.100 por 3 días, 32% bajo tu límite de $6.000”.

## Fundamentos visuales

### Color

- El blanco manda: `background` y `card` son blancos en claro; las tarjetas se separan con `border`, no con sombras ni grises.
- Texto principal `foreground`; secundario `muted-foreground` (≥5,7:1 sobre `background`, `card` y `muted` en ambos temas).
- `muted` es la superficie hundida: el texto original en la revisión, campos de solo lectura.
- `primary` solo para: botón principal, pestaña activa, selección (`primary-soft`), foco (`ring`) y enlaces.
- Estados: `success` / `success-soft`, `warning` / `warning-soft`, `destructive` / `destructive-soft`. Texto de estado siempre sobre su `-soft`, `background` o `card`.
- Gráficos: costos en grises (`chart-1`…`chart-3`), ganancia en `chart-4` (verde), pérdida en `chart-5`.
- Los nombres de color siguen la convención de shadcn/ui (`background`, `primary`, `muted`, `accent`…). Ojo: en shadcn `accent` es el fondo neutro de hover, no el acento de marca.

### Tipografía

- Una familia: **Geist** (Google Fonts), compacta y con cifras tabulares limpias; **Geist Mono** solo para SKU e IDs (`type-code`).
- Móvil: `type-title` para el título de pantalla, `type-heading` para tarjetas, `type-body` (15px) para el contenido, `type-label` para etiquetas y botones pequeños, `type-caption` (12px, el mínimo) para metadatos.
- Escritorio: el título de pantalla sube a `type-display`.
- La cifra que decide (ganancia por venta, CPA) va en `type-metric-lg`; las cifras de tarjetas en `type-metric`.
- Los campos usan 16px para que el teléfono no haga zoom al enfocar.

### Espaciado y layout

- Base de 4px. Margen lateral en móvil `space-4`; entre tarjetas `space-3`; entre secciones `space-6`.
- Mobile first: una columna de 390px de referencia. Desde `bp-md` (768px) las listas pasan a dos columnas; desde `bp-lg` (1024px) la barra inferior se vuelve riel lateral (`size-rail`) y el asistente pasa a panel derecho.
- La acción principal vive en una barra fija inferior (`df-sticky`), en la zona del pulgar.
- Área táctil mínima `size-touch` (44px) en todo control, aunque el dibujo sea menor.

### Forma y elevación

- Radios `radius-sm` (6px, miniaturas), `radius-md` (10px, botones, campos, imágenes), `radius-lg` (14px, tarjetas y hojas), `radius-full` (chips). `radius` es el `--radius` base de shadcn.
- Bordes antes que sombras. `shadow-md` solo para lo que flota (toast, barra fija); `shadow-lg` para hojas inferiores y el asistente.

### Movimiento

- Breve y funcional: `duration-fast` (120ms) para presionar, `duration-base` (200ms) para avanzar entre propuestas o elegir una imagen, `duration-slow` (320ms) para abrir hojas.
- `ease-enter` para lo que entra, `ease-exit` para lo que sale (una propuesta aceptada), `ease-standard` para cambios en el lugar.
- El único movimiento continuo es el de `publicando` (y el brillo de imágenes generándose). Con `prefers-reduced-motion` todo pasa a 0ms.

### Estados de interacción

- Foco de teclado: 2px del color de fondo y 2px sólidos de `ring`; ≥3:1 sobre cualquier superficie en ambos temas.
- Hover: `accent` para neutros, `primary-hover` para el principal.
- Presionado: escala 0,98 en botones.
- Deshabilitado: `muted` con `muted-foreground`; nunca solo opacidad.
- Controles con borde `input` (≥3:1 sobre `background` y `card`).

## Ciclo de vida del contenido

| Estado | Chip | Qué significa | Qué puede hacer el comerciante |
|---|---|---|---|
| Generado | neutro + destello | La IA lo creó; nadie lo ha visto | Revisar |
| En revisión | ámbar + ojo | Abierto, espera decisión | Aceptar, editar, descartar |
| Aprobado | verde suave + check | Listo para publicar | Publicar, volver a editar |
| Rechazado | contorno gris + x | Descartado; se conserva para recuperar | Recuperar |
| Publicándose | neutro + arco girando | Enviándose a la tienda o a Meta | Esperar |
| Publicado | verde sólido + check en círculo | En la tienda o en el aire | Ver, pausar |
| Con error | rojo suave + triángulo | Falló el envío; dice por qué | Reintentar, ver detalle |

Usa siempre `StatusBadge`; no inventes chips de estado.

## Iconografía

- Íconos propios de trazo (1,75px, 24×24, puntas redondeadas) en `Icon`, que heredan `currentColor`. 20px por defecto, 16px (`size="sm"`) en chips y filas.
- Significados fijos: destello = IA; ojo = en revisión; check = aprobado; triángulo = error; reloj = detenido o esperando; candado = etapa bloqueada; megáfono = campañas; bandeja = Hoy; caja = productos.
- Sin emojis en la interfaz.
- DropFlex no tiene logotipo definido en este sistema: el nombre se compone en Geist 600. Reemplázalo cuando exista una marca.

## Imágenes

- Las imágenes de producto van en cuadrado (`aspect-ratio: 1`) con `radius-md` en grillas y `radius-sm` en miniaturas de 48px.
- La vista del comprador (`OfferPreview`) usa colores fijos de tienda y no cambia con el tema de DropFlex.
- Las ilustraciones de producto de estas pantallas son marcadores de posición.

## Accesibilidad

- WCAG 2.1 AA verificado: todo texto ≥4,5:1 sobre las superficies que nombra su nota, en claro y en oscuro; bordes de controles, íconos con significado y foco ≥3:1.
- El estado nunca depende solo del color (ícono + palabra).
- Todo `IconButton` lleva `label`; las etapas bloqueadas usan `aria-disabled` y explican de qué dependen.
- `publicando` y el toast usan `role="status"` para lectores de pantalla.
