# Producción del ebook

El chat escribe y diseña; DropFlex aporta el contexto y el acento. No hay una tool de PDF ni de entrega de regalos en el MCP actual. El script empaquetado genera un archivo local con ReportLab; no llama proveedores, no publica y no consume una clave de IA.

## Manuscrito editable

Prepara JSON UTF-8 con los campos siguientes. Los nombres del contrato van en inglés; el contenido usa el idioma del mercado. Las rutas de imágenes son locales, relativas al manuscrito o absolutas; el script no descarga URLs.

```json
{
  "title": "Tu espacio, listo para empezar",
  "subtitle": "Una guía práctica para organizar lo que usas a diario",
  "product_name": "Nombre confirmado del producto",
  "brand": "Nombre confirmado de la tienda",
  "accent_color": "#1f4bd8",
  "context": {
    "product_id": "ID real del producto",
    "strategy_id": "ID real o null si no hay estrategia",
    "angle": "Argumento elegido",
    "hook": "Texto elegido",
    "reader": "Quién compra",
    "editorial_promise": "Qué podrá aplicar al terminar",
    "accent_source": "product"
  },
  "cover_illustration": {
    "kind": "sequence",
    "title": "Tu recorrido",
    "items": ["Elegir", "Organizar", "Mantener"]
  },
  "chapters": [
    {
      "title": "Empieza por lo que sí usas",
      "intro": "Explica el objetivo de este capítulo.",
      "paragraphs": ["Desarrolla una idea útil con un ejemplo concreto."],
      "steps": ["Una acción aplicable", "La siguiente acción"],
      "checklist": ["Una comprobación que el lector puede hacer"],
      "callout": {"title": "Pruébalo hoy", "body": "Una tarea pequeña y concreta."},
      "illustration": {
        "kind": "comparison",
        "title": "Compara tus opciones",
        "items": ["Opción y explicación", "Otra opción y explicación"],
        "caption": "Qué enseña este esquema."
      }
    }
  ],
  "sources": [{"label": "Fuente consultada y qué aporta", "url": "https://example.com/documento"}],
  "landing_gift": {
    "headline": "Una guía práctica de regalo",
    "body": "Utilidad concreta del ebook. Incluido gratis con cada compra.",
    "delivery_note": "Mecanismo real de entrega o pendiente de configurar"
  }
}
```

El hex de arriba es un ejemplo de contrato: reemplázalo por `data.appearance.accent_color`, nunca lo uses como respaldo si falta el dato. `brand` es opcional si no conoces el nombre; no atribuyas el ebook a DropFlex en lugar de a la tienda. `context` conserva trazabilidad y no se imprime. El texto de `landing_gift` se conserva para la PDP, no se publica automáticamente.

`chapters` necesita al menos un capítulo con contenido útil; los campos de contenido son opcionales individualmente. Las ilustraciones aceptan:

- `kind: "sequence" | "checklist" | "comparison"`, `title` opcional, `items` de 2 a 6 textos y `caption` opcional. Son diagramas vectoriales rotulados; cada tipo tiene una presentación diferente.
- `kind: "image"`, `path` al archivo, `caption` opcional. Usa PNG, JPEG o WebP legible; conserva proporciones y no recorta. Un dibujo preparado específicamente para el capítulo aporta más que una imagen de catálogo repetida.

El script escapa el texto: escribe texto plano, no HTML o Markdown de maquetación. Escribe fuentes como enlaces HTTPS reales consultados; no dejes el enlace del ejemplo. Usa acento para la identidad y tinta oscura para el cuerpo. Si el acento es claro, el generador ajusta únicamente el color de texto contrastado, preservando el acento original en los elementos gráficos.

## Generar y revisar

En Codex usa primero `load_workspace_dependencies` para localizar Python y bibliotecas. En otros hosts usa el entorno de ejecución disponible. Necesita `reportlab` y Pillow; para comprobar el PDF usa `pypdf` o `pdfplumber`, y para renderizar Poppler o el renderizador del host. Instala solo dependencias faltantes si el entorno lo permite. Si no puede ejecutar código ni producir un archivo, conserva el manuscrito y comunica esa limitación; no declares que creaste un PDF.

```sh
python scripts/build_ebook.py manuscript.json --output ebook.pdf
pdftoppm -scale-to 1200 -png ebook.pdf preview/page
```

El script acepta `--font-regular` y `--font-bold` para fuentes TTF de la marca cuando están disponibles. Sin ellas usa Helvetica/Helvetica-Bold, compatibles con el español. La paleta neutra y la escala de texto/espaciado proceden de `design-system/tokens.json` de DropFlex (claro); el acento procede del producto. El formato A5 es una decisión editorial del ebook, no una medida nueva de la UI de la app.

La portada contiene la promesa editorial, el nombre del producto y la ilustración. El índice es navegable por capítulos; los saltos de página y las continuaciones se calculan sin reducir el texto a un tamaño ilegible. Cada capítulo debe aportar una acción, ejemplo o recurso que justifique su espacio. El generador imprime fuentes al final solo si hay fuentes reales.

Inspecciona todas las páginas renderizadas a tamaño móvil. Confirma que no hay texto cortado, marcas faltantes, desbordamientos, imágenes deformadas ni páginas con solo un título. Extrae texto y comprueba principio/final de cada capítulo y enlaces. Corrige el manuscrito o la maquetación, regenera y vuelve a revisar el resultado final. Entrega un archivo PDF accesible desde el chat; un enlace mostrado no garantiza entrega con los pedidos.
