# Escritura UGC: sostener el argumento después del hook

Usa esta referencia al proponer conceptos, redactar o editar un guion UGC. La tarea es convertir una motivación de compra en una historia breve que haga comprensible el valor del producto y cierre con la oferta vigente.

## Recuperar la dirección y los datos

Lee `get_product_context` para producto, mercado, precio, packs y políticas. Un guion guardado o la selección estratégica no sustituyen el contexto del producto: recupera la oferta y los datos necesarios antes de redactar. Cuando necesites los registros completos del análisis, solicita `view: "full"`, limita `include` a los bloques relevantes y pagina. Lee `get_product_strategy` con `include: "execution"`: el valor predeterminado `core` omite objeciones, lenguaje del cliente y `generation_guidance`. Recupera `get_ugc_content` con `include_contract: true`; por `script_id` cuando vayas a editar un guion existente. El contrato y las reglas devueltas prevalecen sobre ejemplos históricos.

Identifica el ángulo y hook elegidos antes de recomendar un video. El principal es el primer ángulo de la estrategia; el hook exacto está en `Angle.hook`. Usa también `generation_guidance` cuando exista: `central_message`, `spoken_hook`, `screen_hook`, `hook_delivery`, `opening_shot`, `first_motion`, `follow_up`, referencias de objeciones y hechos, y `ugc_notes`. Estos datos orientan la escritura; no sustituyen el razonamiento del chat.

Conserva la motivación elegida al adaptar el hook al lenguaje hablado. Otra apertura del mismo argumento es una variante; cambiar de una preocupación sobre el resultado buscado a «te falta un paso en la rutina» puede ser otro ángulo. En una exploración, distingue alternativas de la dirección vigente y explica el cambio. No presentes otra motivación como la principal ni la selecciones sin una elección explícita. Si el pedido cuestiona el fundamento del ángulo, aplica el diagnóstico y elección de hooks de la skill.

## Construir la cadena argumental

Antes de redactar, concreta con los datos vigentes esta cadena:

| Eslabón | Decisión editorial |
|---|---|
| Situación de compra | Qué vive la persona, en qué momento y qué hace relevante el problema o deseo. Evita definirla solo por edad o por usar la categoría. |
| Motivación | Qué quiere cambiar o conseguir, qué intenta hoy y por qué eso no le basta. Mantén la tensión que abre el hook. |
| Beneficio | Qué utilidad concreta del producto responde a esa motivación. Explica por qué le importa; un ingrediente o atributo suelto no es el beneficio. |
| Explicación o demostración | Qué característica, mecanismo, uso o contraste hace comprensible ese beneficio y cómo se ve en pantalla. Una aplicación decorativa no explica por sí sola la razón de compra. |
| Objeción | Qué duda relevante puede impedir esa compra y cómo la respuesta conecta con producto, explicación u oferta. Elige una; no enumeres todas. |
| Oferta | Qué recibe, por qué esa cantidad o pack tiene valor y qué acción debe tomar. Usa la oferta canónica, el pack recomendado y las condiciones reales, salvo otro alcance explícito. |

Esta cadena es preparación editorial, no seis escenas obligatorias ni un formulario que el comerciante deba completar. Puedes combinar funciones, variar el orden y dar más peso a las que el producto necesita. Resume el argumento en una o dos frases al presentar la propuesta; no añadas una aprobación ni un informe extenso. Cuando falte investigación de clientes, desarrolla hipótesis explícitas con lo disponible sin inventar observaciones o validación. La procedencia opcional no bloquea redactar o guardar.

## Escribir escenas que avanzan

Cada escena debe aportar algo nuevo a la misma razón de compra. Conecta lo dicho con lo mostrado: la imagen ilustra la situación, explica el uso o mecanismo, hace visible un beneficio, responde una duda o aclara la oferta. El actor, entorno, cámara y actuación deben servir a esa función.

Comprueba los enlaces entre escenas: después de reconocer la situación, ¿por qué este producto resulta pertinente? Después de explicar el beneficio, ¿qué lo hace creíble o comprensible? Antes del cierre, ¿qué duda queda y por qué la oferta tiene sentido? Si una línea solo dice que es fácil, que se añade a una rutina o que es un momento de autocuidado, conecta esa idea con la motivación elegida o sustitúyela. No uses esas frases como respuesta universal.

Ejemplo de revisión: un hook sobre verse cansada después de descansar abre una discrepancia entre descanso y apariencia. Pasar enseguida a una rutina incompleta cambia la motivación. Desarrolla el resultado buscado, conecta el cuidado específico y sus características con él, muestra el uso que lo explica y responde una duda antes de la oferta. Conserva el alcance de lo que el producto puede aportar; la explicación no necesita prometer una transformación ni simular resultados de una compradora real.

Prueba de especificidad: si puedes cambiar la marca por cualquier producto de la categoría y conservar casi todo el guion, revisa el beneficio, la explicación o la oferta. Un nombre, envase e ingrediente mencionados no bastan para diferenciar el argumento. Explica con lo disponible cómo una característica o uso concreto contribuye al beneficio buscado. «Se aplica con toques» muestra uso; necesita una conexión con la razón de compra. «No es magia» no sustituye una duda de ese comprador. En el cierre, concreta qué recibe con el pack vigente y por qué tiene valor; «descubre tu pack» no basta si ya puedes leer su contenido y condiciones.

Corrige estas debilidades antes de presentar la propuesta. No entregues un guion genérico acompañado de «punto mejorable: añadir después el beneficio o el pack». Cuando un dato no está disponible, desarrolla el argumento con los datos presentes y delimita la hipótesis concreta, sin inventar ingredientes, condiciones ni resultados. Para una persona de IA, respeta las reglas UGC sobre testimonios y resultados propios; una demostración propuesta no es evidencia de una experiencia real. Al proponer un guion describe las acciones visuales; no busques imágenes de otros productos para completar las escenas si no se solicitaron referencias.

## Comprobar tiempos antes de mostrar

Comprueba el texto exacto con `validate_ugc_script_timing({product_id, format, hook: {spoken, screen}, a_roll: [{line, seconds}]})` antes de mostrarlo. Envía la apertura completa que comunica la tensión, no solo su primera pregunta. Esta tool usa el contador y límites canónicos del video; devuelve palabras, ritmo y problemas por campo. Es una lectura sin guardado, `dry_run`, proveedores ni gasto: puede usarse aunque el comerciante diga «no guardes». No estimes el conteo por intuición ni inventes un máximo global. Revisa el contrato vigente, incluso si solo vas a responder en el chat. Como referencia del contrato actual:

- UGC con persona: 4–6 tomas habladas, 4–8 segundos cada una y 24–32 segundos hablados en total. Mascota: 3–5 tomas y 20–26 segundos, con el mismo rango por toma.
- Escribe con margen, alrededor de 2,7 palabras por segundo; el máximo aceptado es 3. Si una escena excede el máximo, acorta la línea o redistribuye su tiempo dentro de los límites. No declares una duración que el texto no puede cumplir.
- La apertura que comunica la tensión completa cabe en los primeros 3 segundos: máximo 9 palabras. No cuentes solo «¿Dormiste bien?» y dejes fuera la discrepancia que le da sentido al hook; dividir con signos de puntuación no reduce el conteo. Una adaptación completa posible es «Dormiste bien, ¿por qué tu mirada parece cansada?» (8 palabras). El primer texto en pantalla tiene hasta 6 palabras y comunica la tensión completa, sin depender del sonido. Quitar la mitad significativa del hook puede hacer que se entienda otro mensaje.
- Los precios van en pantalla. Pago al recibir y envío gratis van en oferta/cierre conforme a las reglas UGC actuales. Respeta el idioma del mercado y los límites del formato.

Ejemplo: 20 palabras en 5 segundos son 4 palabras por segundo y no caben. En ese tiempo, el máximo es 15; para una voz con margen, apunta a unas 13. Revisa cada toma: un promedio global aceptable puede esconder dos escenas imposibles de decir.

Al presentar un guion, muestra duración por escena, texto hablado exacto, palabras, palabras/segundo, imagen/acción y texto en pantalla cuando corresponda. Usa los conteos devueltos por la tool para esas mismas líneas; redondea solo la presentación del ritmo, sin cambiar el valor para aprobarlo. Si `data.valid` es falso, acorta o redistribuye y vuelve a comprobar; si editas una línea o sus segundos después de validar, repite la lectura. El resultado `scope: "timing_only"` no certifica continuidad argumental, claims ni plan de tomas. Si falta la tool, entrega lo independiente indicando que los tiempos no están comprobados y pide refrescar la conexión; no llames writers como sustituto. La función argumental debe ser comprensible. Los tiempos son previstos; al montar, CapCut usa las duraciones reales de los clips. El cierre añadido puede alargar el archivo final frente a la suma de voz: no confundas ambas duraciones.

## Revisar y guardar según el pedido

Antes de entregar, comprueba que apertura y desarrollo conservan la misma motivación, cada escena añade una razón o reduce una duda, la explicación conecta producto y beneficio, la oferta corresponde a los datos vigentes y las líneas caben en sus tiempos. Reescribe lo débil en el chat; esta revisión editorial no llama a otra IA ni autoriza intentos de pago.

«Propón un guion, no guardes» autoriza lecturas necesarias y una propuesta conversacional: no llames writers, ni siquiera con `dry_run`. Cuando esté solicitado guardar, usa `save_ugc_content` con los campos reales `hook`, `content.lines` y `content.plan`; `dry_run: true` valida sin guardar antes de la escritura efectiva. No inventes un campo `argument_chain` ni una tool de aprobación. Conserva ángulo, selectores comerciales y medios existentes. Cambiar el guion no solicita clips, montaje ni publicación; sigue [producción](production.md#otros-entregables-solicitados) para esas operaciones cuando estén pedidas.
