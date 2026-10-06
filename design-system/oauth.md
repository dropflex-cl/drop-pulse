# Conexión MCP

Consentimiento en `/oauth/consent`, dentro del marco de acceso existente. Autorización solo desde una sesión propia del comerciante. La aplicación cliente se muestra como texto; no cargar su logo ni visitar su URL.

Título: «Autoriza la conexión MCP». Descripción: «{cliente} solicita acceso a tu catálogo de DropFlex durante 30 días. Elige qué puede hacer.»

Usar `AuthCard`, `Switch`, `Button` y `FormError` existentes, con sus tokens y áreas táctiles. Lectura siempre seleccionada; los demás permisos comienzan apagados:

| Permiso | Etiqueta | Explicación |
| --- | --- | --- |
| product_intelligence:read | Consultar contexto y estrategia | Lee los productos, análisis y decisiones guardadas. |
| product_intelligence:write | Guardar análisis y estrategia | Guarda el contenido del chat y cambia la estrategia seleccionada. |
| product_intelligence:verify | Revisar hechos y evidencia | Puede confirmar o descartar hechos y sus fuentes. |
| landing:generate | Generar página del producto | Puede iniciar generación con tus proveedores y consumir créditos. |
| ugc:generate | Generar UGC | Puede iniciar guiones, imágenes y clips con tus proveedores y consumir créditos. |
| performance:read | Consultar métricas | Lee resultados y métricas disponibles del producto. |

Nota: «Puedes revocar esta conexión en cualquier momento. Publicar en Shopify o Meta requiere una decisión aparte.» No conceder permisos de publicación en esta pantalla.

Identidad y renovación: «El cliente recibirá tu correo y podrá renovar su acceso hasta que venza o lo revoques.» Solo admitir los scopes OAuth `email` y `offline_access`; no exponer OIDC/userinfo como capacidad disponible para este token aislado.

Acción principal: «Autoriza la conexión». Secundaria: «Rechaza la conexión». Durante el envío se bloquean los controles. Error seguro en `FormError`, indicando reconectar o reintentar; no mostrar JWT, código OAuth ni detalles del proveedor.

Administración en `/oauth/connections`: título «Conexiones MCP», descripción «Revisa los clientes con acceso a tu catálogo. Revoca una conexión para cortar su acceso.» Mostrar cliente, permisos y vencimiento; acción «Revoca la conexión», sin confirmación adicional. Una revocación corta el acceso; volver a conectar requiere consentimiento nuevo. Sin conexiones: «Todavía no tienes conexiones MCP.»

Nombre ausente: «Cliente MCP». Vigencia: «Vence el {fecha}» o «Acceso inactivo». En Ajustes, sección «Conexiones MCP» con la misma descripción y acción «Revisa tus conexiones»; solo aparece con MCP configurado.
