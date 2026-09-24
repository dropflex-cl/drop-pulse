# Anuncios y motor de decisión

Dos piezas que comparten una configuración: el **configurador de lanzamiento** (qué se crea en Meta) y el **motor de decisión** (cuándo esperar, pausar o escalar lo creado). El comerciante elige una estructura, carga una plantilla y cambia lo que quiera.

## Dónde vive

- **Lanzar:** etapa Anuncios del producto → "Lanzar campaña". Parte con los ángulos y textos aprobados.
- **Seguir:** pestaña Campañas → detalle de la campaña. Las decisiones del motor aparecen también en Hoy (`AttentionItem`) y en la tarjeta de campaña (`CampaignCard`).
- **Plantillas propias:** Ajustes › Plantillas de campaña (duplicar, renombrar, borrar).

## El configurador

1. **Estructura** (`StructurePicker`): ABO o CBO, las dos únicas opciones.
2. **Plantilla** (`PresetSelect`): filtrada por estructura; precarga público, presupuesto, horario, textos y reglas. Todo queda editable; los cambios se cuentan y se pueden guardar como plantilla nueva.
3. **Secciones** (`ConfigSection`), cada una con resumen de una línea:

| Sección | Campos | Notas |
|---|---|---|
| Creativos | imágenes y videos (`CreativeSlot` + `ImageUploader`) | ABO: un conjunto por creativo y un anuncio por conjunto. CBO: los creativos van como anuncios |
| Público | países, regiones excluidas (`ChipInput`), ubicación (vive o estuvo), edad mínima, público abierto (Advantage+) o intereses | Intereses solo con público de intereses. Lo que no se envía queda en el valor por defecto de Meta, y se dice |
| Presupuesto y horario | presupuesto diario y puja (en cada conjunto en ABO; en la campaña en CBO), inicio (por defecto, mañana a primera hora) | Muestra el total diario |
| Textos del anuncio | textos principales, títulos, descripciones, URL del producto, botón (Comprar) | Vienen de los desarrollos aprobados en Ángulos; se pueden editar |
| Motor de decisión | modo y reglas (abajo) | |

4. **Vista en vivo** (`CampaignTree`): campaña → conjuntos → anuncios, con el presupuesto marcado donde vive.
5. **Revisar y lanzar:** resumen y "Crear en pausa". Se crea en el orden campaña → medios → creativos → cada conjunto y sus anuncios. Si falla el primer conjunto, se cancela todo y no queda una campaña vacía. "Publicar" activa campaña, conjuntos y anuncios en ese orden, y es un paso aparte y explícito.

## El motor de decisión

### Modos
- **Solo recomendar** (por defecto): el motor propone y el comerciante aplica con un toque (`DecisionRow`).
- **Automático:** el motor aplica pausas y aumentos dentro de los topes. Activarlo pide confirmación y muestra el tope diario. Todo cambio automático queda registrado con hora, regla y "Deshacer" o "Reactivar".

### Reglas (`RuleGroup` + `RuleRow`)
Se escriben como frases con valores editables en línea, en tres grupos que se evalúan en orden:

1. **Esperar** manda: mientras no se cumpla, no se pausa ni se escala. Evita decidir durante el aprendizaje de Meta o justo después de editar.
2. **Pausar:** corta lo que pierde dinero.
3. **Escalar:** sube presupuesto a lo que gana, en pasos y con un tope diario que nunca se supera.

Las cifras se expresan contra el **CPA límite** de Ajustes ("1,5× tu CPA límite"), así las reglas sirven para cualquier producto y se ajustan si el límite cambia.

### Nivel según estructura
| | ABO | CBO |
|---|---|---|
| Pausar | cada conjunto | cada anuncio |
| Escalar | presupuesto de cada conjunto | presupuesto de la campaña |
| Esperar | por conjunto | por anuncio y por campaña |

### Qué ve el comerciante
Cada conjunto o anuncio tiene una decisión: Esperando (con la barra de cuánto falta), Mantener, Pausar, Escalar, o Pausado/Escalado por el motor. Siempre con la cifra que la justifica y la regla que la disparó.

## Valores de las plantillas

Los valores de las reglas en estas pantallas (1× CPA o 48 h para esperar, 1,5× sin ventas para pausar, ≤0,8× por 3 días y +20 % para escalar, tope de $60.000) son **ejemplos editables**. Las plantillas del sistema deben cargar los valores definidos en la especificación del motor.
