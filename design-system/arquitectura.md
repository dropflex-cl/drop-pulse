# Arquitectura y navegación

La estructura sale de los siete casos de uso, no de las pantallas de una app típica. Una pregunta ordena todo: **¿qué tiene que decidir el comerciante ahora?**

## Mapa

```
Onboarding ───── Crear cuenta → Shopify → Productos → Tus números → Meta Ads (opcional) → Listo
                 (ver sección Onboarding; termina en el primer producto a revisar)

Hoy  ─────────── cola de decisiones (todas las pantallas desembocan aquí)
│
Productos ────── lista filtrable: Avanzan · Detenidos · Publicados
│   └─ Producto ── ruta de etapas + "Continuar"
│        ├─ Información base  texto libre + imágenes de referencia → cliente ideal (aprobar)
│        ├─ Reseñas (opcional) importar de AliExpress → aprobar · rechazar · editar
│        ├─ Ángulos ....... ranking de 6 → principal + secundario → 2 desarrollos → aprobar
│        ├─ Textos ........ la página del producto: 14 bloques, uno a la vez → aceptar · editar · descartar
│        ├─ Imágenes ...... elegir, ordenar, descartar
│        ├─ Publicar en tu tienda
│        └─ Anuncios (opcional) lanzar campaña: ABO o CBO + plantilla + creativos + motor de decisión
│        (Precio y oferta: por ubicar en la nueva ruta)
│
Campañas ─────── tarjetas con veredicto: Sube · Déjala · Vigílala · Apágala
    └─ Campaña ── decisiones del motor por conjunto o anuncio (esperar · pausar · escalar), reglas, cifras

Asistente ────── hoja sobre cualquier pantalla, con el contexto actual
Ajustes ──────── supuestos (tasa de entrega, CPA máximo), Conexiones (Shopify, Meta Ads), Plantillas de campaña, plan
```

## Decisiones y por qué

### 1. Tres pestañas: Hoy, Productos, Campañas

- **Hoy es el inicio**, no un panel de métricas. El usuario abre la app entre otras tareas; lo primero que ve es la lista de decisiones pendientes, ordenada por impacto (errores y dinero primero, revisión después, lo detenido al final). Resuelve el caso 1 (dónde estoy parado) y es la puerta rápida a los casos 3 y 6.
- **Productos** es el inventario y el lugar para retomar (caso 2). El filtro Avanzan · Detenidos · Publicados responde “cuáles avanzan, cuáles están detenidos” con un toque, y cada fila dice *por qué* está detenida.
- **Campañas** está al mismo nivel porque vigilar anuncios es un hábito diario que no depende de un producto concreto (caso 6), y porque es donde se gasta dinero.
- Tres destinos caben con etiqueta completa y buen tamaño táctil en una barra inferior. Más pestañas diluirían la señal; menos obligarían a esconder campañas dentro de productos.

### 2. El producto es una ruta, no un formulario

- El proceso es largo, con dependencias y opcionales. Mostrarlo como lista vertical de etapas (`StageList`) deja ver de un vistazo qué está hecho, qué espera y qué depende de qué: una etapa bloqueada dice qué la desbloquea.
- Un único botón fijo **“Continuar: <etapa>”** lleva a lo siguiente pendiente. El comerciante no tiene que recordar dónde quedó (caso 2).
- Las etapas son pantallas propias, no pestañas dentro del producto: en móvil cada una necesita todo el ancho y su propia barra de acción.
- Las opcionales (anuncios, video) nunca bloquean “Publicar”.

### 3. Revisión como flujo de una propuesta a la vez

- Se revisa muchas veces por producto (caso 3), así que el costo por decisión debe tender a cero: una propuesta en pantalla, original arriba y apagado, propuesta abajo y marcada, tres acciones fijas bajo el pulgar.
- Aceptar o descartar avanza solo a la siguiente; “Deshacer” en un toast reemplaza las confirmaciones.
- En escritorio se ve lado a lado con atajos (A, D, E) y la lista de lo que sigue.

### 4. Imágenes: tocar es elegir, el número es el orden

- Una grilla de 3 columnas y un solo gesto (tocar) para elegir; el número que aparece es la posición en la tienda y el 1 es la portada (caso 4). Reordenar es mantener presionado. Descartar no borra: apaga y deja “Recuperar”.

### 5. Precio: la ganancia primero, la vitrina al lado

- La pregunta real es “¿cuánto gano?”, así que esa cifra encabeza y se recalcula mientras escribe. El desglose muestra en qué se va el resto, y la vista del comprador confirma cómo se verá la oferta (caso 5).
- Los supuestos (tasa de entrega, CPA estimado) se declaran debajo y se cambian en Ajustes, para que las cifras sean honestas sin llenar la pantalla de campos.

### 6. Campañas: veredicto, razón, cifras, acción

- El comerciante no es analista: cada campaña empieza por lo que debe hacer, sigue con una frase que cita la cifra y su límite, y recién después las métricas para verificar (caso 6).
- “Aún aprendiendo” evita decisiones prematuras y dice cuánto esperar.

### 7. El asistente es una capa, no un destino

- Pedir consejo no debe sacarlo de lo que ve (caso 7). En móvil el asistente se abre como hoja inferior al 60% sobre la pantalla actual; en escritorio, como panel derecho.
- Siempre dice sobre qué responde (chip de contexto), y lo que propone entra al ciclo como `generado`, nunca se aplica directo.
- Se abre con el destello de la barra superior de cada pantalla de producto: mismo lugar, mismo ícono.

### 8. Producto sin optimizar: primero la materia prima

- Un producto recién importado abre en la etapa **Información base**: un solo campo de texto libre (`ProductInfoInput`) y sus imágenes de referencia (`ReferenceImage` + `ImageUploader`). Es lo que la IA necesita para generar bien, y el comerciante lo tiene desordenado; por eso no es un formulario.
- Parte lleno: la descripción y las imágenes de Shopify ya están ahí. El comerciante solo agrega lo que sabe y excluye las imágenes que no sirven (con texto del proveedor, de baja calidad).
- La IA muestra qué temas encontró (beneficios, medidas, materiales…) para que sepa qué falta, pero nunca bloquea: "Optimizar con IA" está siempre disponible con al menos una imagen.
- Textos e Imágenes quedan bloqueadas hasta optimizar; Precio y oferta se puede adelantar.
- Móvil: imágenes en una fila de 4 arriba (tile "Agregar" abre una hoja inferior), texto debajo, "Optimizar con IA" en la barra fija. Escritorio: ruta a la izquierda, texto al centro, referencias y carga a la derecha.

### 9. Reseñas: etapa opcional, justo después de Información base

- **Dónde:** una etapa propia y opcional, "Reseñas", entre Información base y Textos. Nunca se bloquea ni bloquea a otras: se puede hacer antes o después de optimizar, y "Publicar" no la exige.
- **Por qué ahí y no más tarde:** las reseñas reales son materia prima. Si se importan antes de "Optimizar con IA", la IA las usa para escribir beneficios, objeciones y preguntas frecuentes con palabras de clientes. Por eso Información base ofrece un acceso directo ("Importa reseñas de AliExpress").
- **Por qué no dentro de Información base:** curar 50 o 200 reseñas es un trabajo de decisión, como revisar textos, no de carga de datos. Mezclarlo alargaría la pantalla que debe llevar rápido a "Optimizar con IA".
- **Por qué no dentro de Textos:** tienen su propio ciclo (importada → aprobada/rechazada → publicada) y se publican en otro lugar de la tienda (el widget de reseñas).
- **Curación en lote con control:** filtro Por revisar · Aprobadas · Rechazadas, una acción sugerida ("Aprobar las 9 de 5★ con foto y sin alertas") y decisión por tarjeta con Deshacer.
- **Honestidad:** se publican con calificación, fecha y país originales y con la fuente visible en la tienda ("Reseñas de compradores del mismo producto en AliExpress"); editar solo corrige traducción u ortografía, conserva el original y marca la reseña como editada. Presentar reseñas de otra tienda como propias o cambiar su sentido puede infringir normas de protección al consumidor: el diseño lo evita por defecto.

### 10. Ángulos: diagnosticar, elegir y desarrollar

- **Dónde:** entre Información base y Textos. Se habilita cuando el comerciante aprueba el cliente ideal; antes aparece bloqueada con ese motivo. Textos se habilita al aprobar los 2 desarrollos.
- **Entrada visible:** al entrar se ve el cliente ideal aprobado (`IcpSummary`) y qué hará la IA, antes del botón "Elegir ángulos con IA". El comerciante sabe sobre qué base se decide.
- **Los 6, siempre:** el ranking muestra todos los ángulos en orden de puntaje (`AngleCard`), también los bajos, atenuados. Cada uno dice por qué encaja o no y sus riesgos con el castigo en puntos. "Cómo se calculó" muestra el desglose que produce el código, así el puntaje se puede explicar y probar.
- **La IA sugiere, el comerciante decide:** `AngleSuggestion` arriba (móvil) o fija a la derecha (escritorio) con principal, secundario, cómo se combinan y qué falta. Cambiar un rol abre una hoja con el ranking como opciones (`OptionList`), con el puntaje y el riesgo de cada uno; el que ya ocupa el otro rol aparece deshabilitado.
- **Lo que falta se puede resolver ahí:** un riesgo como "No hay reseñas reales" trae su acción ("Importar reseñas"). Al volver, "Volver a evaluar" recalcula el ranking.
- **Dos desarrollos en paralelo:** al confirmar, cada ángulo muestra su propio estado (`AngleDevelopment`); se puede revisar el primero mientras el segundo sigue generándose. Cada uno se aprueba, edita o regenera por separado.
- **Cambiar de ángulos después** de desarrollar pide confirmación, porque descarta los desarrollos que dependen de la elección anterior.

## De móvil a escritorio

| Móvil (< 1024px) | Escritorio (≥ 1024px) |
|---|---|
| Barra inferior de 3 pestañas | Riel lateral con las mismas 3 + Ajustes al pie |
| Producto: ruta → pantalla de etapa | Producto: ruta fija a la izquierda + etapa al centro |
| Revisión apilada (original sobre propuesta) | Revisión lado a lado con atajos de teclado |
| Asistente como hoja inferior sobre la pantalla | Asistente como panel derecho de 340px |
| Campañas en una columna | Campañas en dos columnas, cuatro métricas por tarjeta |
| Acción principal en barra fija inferior | Acción principal alineada a la derecha del bloque |

Entre 768 y 1023px (tableta) se mantiene la navegación móvil con listas a dos columnas.
