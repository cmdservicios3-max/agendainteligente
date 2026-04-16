const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// Cargar variables
const credentialsFileName = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

// Inicialización perezosa de Google Calendar
let calendar = null;

function getCalendarInstance() {
  if (calendar) return calendar;

  try {
    let authConfig;
    const fullPath = path.resolve(process.cwd(), credentialsFileName);
    
    // Prioridad 1: Variable de entorno (Para Vercel/Producción)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      console.log("🔐 Usando credenciales de Google desde variables de entorno.");
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      authConfig = {
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar'],
      };
    } 
    // Prioridad 2: Archivo local (Para desarrollo)
    else if (fs.existsSync(fullPath)) {
      console.log("📄 Usando archivo de credenciales local.");
      authConfig = {
        keyFile: fullPath,
        scopes: ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar'],
      };
    } else {
      console.warn(`[WARNING] No se encontraron credenciales de Google (ni ENV ni archivo).`);
      return null;
    }

    const auth = new google.auth.GoogleAuth(authConfig);
    calendar = google.calendar({ version: 'v3', auth });
    return calendar;
  } catch (e) {
    console.error("❌ Fallo crítico al autenticar con Google:", e.message);
    return null;
  }
}

async function createEvent({ summary, description, start, end, minutosAlarma }) {
  const cal = getCalendarInstance();
  if (!cal) throw new Error("Google Calendar no está configurado (falta google-credentials.json)");

  // Formato nativo para las API de google insert
  const event = {
    summary: summary,
    description: description,
    start: {
      dateTime: start,
      timeZone: 'America/Argentina/Buenos_Aires',
    },
    end: {
      dateTime: end,
      timeZone: 'America/Argentina/Buenos_Aires',
    },
  };

  if (minutosAlarma !== undefined) {
    event.reminders = {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: minutosAlarma }],
    };
  }

  const res = await cal.events.insert({
    calendarId: CALENDAR_ID,
    resource: event,
  });

  return res.data;
}

async function listEvents(timeMin, timeMax) {
  const cal = getCalendarInstance();
  if (!cal) throw new Error("Google Calendar no está configurado (falta google-credentials.json)");

  const res = await cal.events.list({
    calendarId: CALENDAR_ID,
    timeMin: timeMin,
    timeMax: timeMax,
    singleEvents: true, // Expande eventos recurrentes en sus propias instancias
    orderBy: 'startTime', // Obligatorio cuando singleEvents = true, es muy util
  });

  return res.data.items || [];
}

async function deleteEvent(eventId) {
  const cal = getCalendarInstance();
  if (!cal) throw new Error("Google Calendar no está configurado (falta google-credentials.json)");

  await cal.events.delete({
    calendarId: CALENDAR_ID,
    eventId: eventId,
  });

  return true;
}

async function updateEvent(eventId, { summary, description, start, end, minutosAlarma }) {
  const cal = getCalendarInstance();
  if (!cal) throw new Error("Google Calendar no está configurado (falta google-credentials.json)");

  // Primero obtenemos el evento existente para no sobreescribir cosas inesperadamente si falta algún dato
  const existingEvent = await cal.events.get({
    calendarId: CALENDAR_ID,
    eventId: eventId,
  });

  const updatedData = { ...existingEvent.data };

  if (summary) updatedData.summary = summary;
  if (description !== undefined) updatedData.description = description;
  
  if (start) {
    updatedData.start = {
      dateTime: start,
      timeZone: 'America/Argentina/Buenos_Aires',
    };
  }
  if (end) {
    updatedData.end = {
      dateTime: end,
      timeZone: 'America/Argentina/Buenos_Aires',
    };
  }

  if (minutosAlarma !== undefined) {
    updatedData.reminders = {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: minutosAlarma }],
    };
  }

  const res = await cal.events.update({
    calendarId: CALENDAR_ID,
    eventId: eventId,
    resource: updatedData,
  });

  return res.data;
}

module.exports = { createEvent, listEvents, deleteEvent, updateEvent };
