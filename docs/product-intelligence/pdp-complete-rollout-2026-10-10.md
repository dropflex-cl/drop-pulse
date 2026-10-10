# PDP completa y plugin 1.3.6

La implementación `bdfea40318fb08e5c33a5a77bad1fd17416bb854` está subida a `main`. El MCP de producción respondió por la conexión existente con los 27 contratos de la PDP, incluidas las diez secciones nuevas. Esta lectura comprueba el catálogo servido; no prueba la actualización del tema de una tienda ni la recarga del schema cacheado de otro cliente.

## Migraciones de producción

Destino vinculado: `oukcswnfrzroxgwqmujf`. `supabase db push --linked --dry-run` enumeró exactamente `20261206000000_rich_product_page.sql` y `20261207000000_pdp_default_visibility.sql`, sin seeds ni roles. `supabase db push --linked --yes` aplicó ambas correctamente.

La consulta posterior confirmó ambas versiones en el historial, `page_components.enabled` con default `true`, los nuevos IDs en el RPC de landing, el reconocimiento de `{"state":"empty"}` y cero propuestas intactas que siguieran desactivadas por el antiguo default. Los RPC comprobados y el helper mantienen ejecución denegada a `anon` y `authenticated`, y permitida a `service_role`, como en la migración previa de automatización. No se aprobaron propuestas ni se publicó contenido en Shopify por aplicar el esquema.

## Plugin publicado

[DropFlex · Optimización](https://chatgpt.com/plugins/Plugin_e3bca2a0f2208191a04ed05f2b5904fa), ID `Plugin_e3bca2a0f2208191a04ed05f2b5904fa`, permanece personal y privado. Versión 1.3.6, release `pluginrel_6aca411aeec081918e7cf9de95baa128`.

Se actualizaron la skill y su referencia de producción para completar la estructura entera, conservar hooks y contenido vigentes, validar evidencia y usar estados vacíos donde corresponda. Ambos manifiestos aumentaron de versión. El overlay contiene solo esos cuatro archivos; la conexión, presentación, prompts, permisos y archivos restantes se conservan. La lectura posterior confirmó la versión, las instrucciones y la preservación de los archivos sin cambios.

Archivo de actualización: `output/plugins/dropflex-optimizer-1.3.6-update.zip`. El empaquetador del repositorio produce además la distribución local 1.3.6. Ninguno de esos ZIP se versiona en Git.

Pasaron 22 pruebas de MCP, HTTP e importación de skills, además de TypeScript y `git diff --check`. Estas pruebas verifican contratos, hashes y recursos; no certifican una nueva generación visual en ChatGPT móvil. La actualización del plugin guardado no recarga una conversación ya abierta. El tema Shopify sigue teniendo su actualización separada en la etapa Publicar de DropFlex; `publish_product` no instala ni actualiza el tema.
