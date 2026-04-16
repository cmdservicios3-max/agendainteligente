const fs = require('fs');
const OpenAI = require('openai');
const { createEvent, listEvents, deleteEvent, updateEvent } = require('./calendar');

// Nota: se requiere la key en process.env.OPENAI_API_KEY
const openai = new OpenAI();

const tools = [
  {
    type: "function",
    function: {
      name: "crear_reunion",
      description: "Crea una nueva reunión o evento en Google Calendar.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "El título del evento. Breve y conciso." },
          descripcion: { type: "string", description: "Detalles adicionales del evento." },
          fecha_inicio: { type: "string", description: "Fecha y hora de inicio en formato ISO 8601 (Ej: 2026-04-16T10:00:00-03:00)." },
          fecha_fin: { type: "string", description: "Fecha y hora de fin en formato ISO 8601. Asume 1 hora de duración si el usuario no especificó." },
          minutos_alarma: { type: "integer", description: "(Opcional) Minutos de anticipación para la alarma. Usa 0 si es para el horario exacto del evento." }
        },
        required: ["titulo", "fecha_inicio", "fecha_fin"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "consultar_eventos",
      description: "Consulta los eventos futuros del calendario dentro de un rango de tiempo. IMPORTANTE: Úsala SIEMPRE antes de intentar borrar o modificar un evento si no tienes el ID exacto.",
      parameters: {
        type: "object",
        properties: {
          fecha_minima: { type: "string", description: "Fecha inicio de búsqueda formato ISO 8601" },
          fecha_maxima: { type: "string", description: "Fecha fin de búsqueda formato ISO 8601" }
        },
        required: ["fecha_minima", "fecha_maxima"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "borrar_evento",
      description: "Borra/Elimina/Cancela un evento existente del calendario usando su ID.",
      parameters: {
        type: "object",
        properties: {
           id_evento: { type: "string", description: "El ID alfanumérico del evento en Google Calendar." }
        },
        required: ["id_evento"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "modificar_evento",
      description: "Modifica o edita los detalles (título, horario) de un evento existente usando su ID.",
      parameters: {
        type: "object",
        properties: {
           id_evento: { type: "string", description: "El ID único del evento." },
           titulo: { type: "string", description: "(Opcional) El nuevo título." },
           fecha_inicio: { type: "string", description: "(Opcional) Nueva fecha y hora de inicio ISO 8601 (-03:00)." },
           fecha_fin: { type: "string", description: "(Opcional) Nueva fecha y hora de fin ISO 8601 (-03:00)." },
           minutos_alarma: { type: "integer", description: "(Opcional) Minutos previos al evento para sonar una alarma en el celular. Usa 0 para hora exacta." }
        },
        required: ["id_evento"]
      }
    }
  }
];

// Memoria simple en memoria (se borra al reiniciar el servidor)
const historias = {};

async function procesarPeticionCalendario({ audioPath, text, chatId }) {
  try {
    let textoFinal = "";

    if (audioPath) {
      // 1. Transcribir Audio (Speech-to-Text)
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
        language: "es"
      });
      textoFinal = transcription.text;
      console.log("Transcripción de Whisper:", textoFinal);
    } else {
      textoFinal = text;
      console.log("Procesando texto directo:", textoFinal);
    }

    // 2. Recuperar o inicializar historial
    if (!historias[chatId]) {
      historias[chatId] = [];
    }

    // 3. Preparar mensajes con Contexto
    // Usamos el formato local de Argentina para que el LLM no se confunda con UTC
    const now = new Date();
    const opciones = { 
        timeZone: 'America/Argentina/Buenos_Aires', 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false 
    };
    const fechaActualAR = new Intl.DateTimeFormat('es-AR', opciones).format(now);
    
    const systemPrompt = { role: "system", content: `Eres un asistente de calendario virtual para un cliente de la agencia CMD Soluciones. 
Tu función es gestionar eventos en Google Calendar mediante herramientas.

-----------------------------------
CONTEXTO TEMPORAL (CRÍTICO)
-----------------------------------
- La fecha y hora ACTUAL en Argentina es: ${fechaActualAR} (GMT-3).
- Usa esta fecha como referencia absoluta.
- Interpreta expresiones como:
  - "mañana" → +1 día
  - "pasado mañana" → +2 días
  - "lunes" → próximo lunes futuro
  - "a la tarde" → 15:00
  - "a la mañana" → 09:00
  - "a la noche" → 20:00

- Todos los eventos deben usar formato ISO con zona horaria:
  Ej: 2026-04-16T10:00:00-03:00

-----------------------------------
REGLAS DE USO DE HERRAMIENTAS
-----------------------------------

CREAR EVENTO Y ALARMAS:
- Si el usuario quiere agendar algo → usar \`crear_reunion\`.
- Si el usuario menciona "avisarme", "recordame", "poné alarma": Extrae la cantidad de minutos de anticipación y envíalos en \`minutos_alarma\`. 
- IMPORTANTE: Si el usuario dice "poné una alarma para dentro de 5 minutos", la hora de inicio es AHORA + 5min, y \`minutos_alarma\` debe ser 0 para que suene a esa hora exacta.

MODIFICAR O BORRAR EVENTO:
- Si el usuario pide modificar o borrar y NO tienes el ID:
  1. Llama INMEDIATAMENTE a \`consultar_eventos\`
  2. Usa la información para encontrar coincidencias

- Si hay UNA sola coincidencia:
  → ejecutar directamente \`modificar_evento\` o \`borrar_evento\`

- Si hay MÚLTIPLES coincidencias:
  → preguntar al usuario cuál (NO ejecutar acción todavía)

- Si NO hay coincidencias:
  → informar que no se encontró el evento

IMPORTANTE:
- NO generes texto antes de usar herramientas cuando sea necesario
- NO expliques lo que estás haciendo internamente

-----------------------------------
MANEJO DE CONTEXTO
-----------------------------------
- Recordá eventos mencionados previamente en la conversación
- Si el usuario dice:
  "borralo", "esa reunión", "lo de mañana"
  → usar contexto previo

-----------------------------------
RESPUESTAS AL USUARIO
-----------------------------------
- Respondé SOLO cuando la acción esté completa
- Confirmá siempre de forma clara:

Ejemplos:
- "Listo, agendé la reunión con Juan mañana a las 10:00."
- "Ya eliminé el evento 'Clase de inglés' del viernes."
- "Encontré varios eventos con ese nombre, ¿cuál querés borrar?"

- Tono: claro, breve y amable (sin exceso de explicación)

-----------------------------------
REGLAS GENERALES
-----------------------------------
- No inventes eventos
- No asumas datos faltantes importantes (preguntar si falta info clave)
- Prioriza precisión sobre velocidad` };

    // Construir el array de mensajes para OpenAI
    const mensajesParaEnvio = [
      systemPrompt,
      ...historias[chatId],
      { role: "user", content: textoFinal }
    ];

    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: mensajesParaEnvio,
      tools: tools,
      tool_choice: "auto",
    });

    let assistantMessage = response.choices[0].message;
    mensajesParaEnvio.push(assistantMessage);

    // 4. Bucle para resolver múltiples tool_calls (permitiendo que el bot busque y luego borre en el mismo turno)
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      let respuestaTool = [];
      
      for (const toolCall of assistantMessage.tool_calls) {
        const functName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        
        console.log(`🤖 Ejecutando API de Calendar: ${functName}`, args);
        
        let toolResult = "";
        try {
          if (functName === "crear_reunion") {
            const evento = await createEvent({
              summary: args.titulo,
              description: args.descripcion || '',
              start: args.fecha_inicio,
              end: args.fecha_fin,
              minutosAlarma: args.minutos_alarma
            });
            toolResult = `¡Éxito! Evento creado. ID: ${evento.id}`;
          } 
          else if (functName === "consultar_eventos") {
            const eventos = await listEvents(args.fecha_minima, args.fecha_maxima);
            if (!eventos || eventos.length === 0) {
              toolResult = "No hay eventos programados.";
            } else {
               toolResult = JSON.stringify(eventos.map(e => ({
                id_evento: e.id,
                titulo: e.summary,
                empieza: e.start.dateTime || e.start.date,
                termina: e.end.dateTime || e.end.date
               })));
            }
          }
          else if (functName === "borrar_evento") {
            await deleteEvent(args.id_evento);
            toolResult = `¡Éxito! Evento eliminado exitosamente del calendario.`;
          }
          else if (functName === "modificar_evento") {
            const updated = await updateEvent(args.id_evento, {
               summary: args.titulo,
               start: args.fecha_inicio,
               end: args.fecha_fin,
               minutosAlarma: args.minutos_alarma
            });
            toolResult = `¡Éxito! Evento actualizado. Nuevo horario de inicio: ${updated.start.dateTime || updated.start.date}`;
          }
        } catch (calendarError) {
          toolResult = `Error: ${calendarError.message}`;
        }

        respuestaTool.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: functName,
          content: toolResult
        });
      }

      // Añadimos las respuestas al historial local del turno
      mensajesParaEnvio.push(...respuestaTool);

      // Llamamos otra vez a OpenAI pasándole el resultado de las herramientas
      // Aquí GPT puede decidir parar y darte texto, O volver a llamar otra herramienta.
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: mensajesParaEnvio,
        tools: tools
      });

      assistantMessage = response.choices[0].message;
      mensajesParaEnvio.push(assistantMessage);
    }

    const textoRespuestaFinal = assistantMessage.content || "He realizado la acción de fondo exitosamente.";

    // Guardar en memoria (Usuario + Respuesta Final)
    historias[chatId].push({ role: "user", content: textoFinal });
    historias[chatId].push({ role: "assistant", content: textoRespuestaFinal });

    // Limitar memoria a los últimos 10 mensajes
    if (historias[chatId].length > 10) historias[chatId].shift();

    return textoRespuestaFinal;

  } catch (err) {
    console.error("Error en AI Logic:", err);
    throw err;
  }
}

module.exports = { procesarPeticionCalendario };
