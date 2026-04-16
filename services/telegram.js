const os = require('os');
const fs = require('fs');
const path = require('path');
const { procesarPeticionCalendario } = require('./ai');

async function handleTelegramMessage(bot, msg) {
  const chatId = msg.chat.id;
  let username = msg.chat.username || msg.from.username || "";
  let authorizedUsersStr = (process.env.AUTHORIZED_USERNAME || "").toLowerCase();
  let authorizedUsers = authorizedUsersStr.split(',').map(u => u.trim().replace('@', '')).filter(u => u);
  username = username.replace('@', '').toLowerCase();

  // Validación de seguridad (lista blanca)
  if (authorizedUsers.length > 0 && !authorizedUsers.includes(username)) {
    return bot.sendMessage(chatId, `❌ Acceso denegado. No tienes permisos para agendar eventos. (Tu usuario es: @${username})`);
  }

  try {
    const statusMsg = await bot.sendMessage(chatId, '🎙️ Te escucho... procesando audio...');
    console.log("📦 Mensaje de voz recibido de @", username);
    
    // Descargar el archivo de audio (.ogg de Telegram)
    const fileId = msg.voice.file_id;
    const fileLink = await bot.getFileLink(fileId);
    console.log("🔗 URL del audio obtenida:", fileLink);
    
    const axios = require('axios');
    const response = await axios({
      url: fileLink,
      method: 'GET',
      responseType: 'stream',
    });

    const fileName = `audio_${Date.now()}.ogg`;
    const tempDir = os.tmpdir();
    const audioPath = path.join(tempDir, fileName);

    const writer = fs.createWriteStream(audioPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log("💾 Audio guardado en disco:", audioPath);
          resolve();
        });
        writer.on('error', (err) => {
          console.error("❌ Error escribiendo audio:", err);
          reject(err);
        });
    });

    // Procesar con IA
    console.log("🧠 Enviando a Whisper/GPT...");
    await bot.editMessageText('🧠 Pensando qué acciones de calendario hacer...', { chat_id: chatId, message_id: statusMsg.message_id });
    const respuestaFinal = await procesarPeticionCalendario({ 
        audioPath: audioPath,
        chatId: chatId
    });
    
    // Limpiar archivo temporal para no ocupar espacio
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);

    // Enviar respuesta final
    await bot.sendMessage(chatId, respuestaFinal, { parse_mode: 'Markdown' });
    
    // Borrar el mensaje de status temporal
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    
  } catch (error) {
    console.error('Error al manejar el mensaje de Telegram:', error);
    bot.sendMessage(chatId, '⚠️ Hubo un error al procesar tu solicitud: ' + error.message);
  }
}

async function handleTelegramTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  let username = msg.chat.username || msg.from.username || "";
  let authorizedUsersStr = (process.env.AUTHORIZED_USERNAME || "").toLowerCase();
  let authorizedUsers = authorizedUsersStr.split(',').map(u => u.trim().replace('@', '')).filter(u => u);
  username = username.replace('@', '').toLowerCase();

  // Validación de seguridad (lista blanca)
  if (authorizedUsers.length > 0 && !authorizedUsers.includes(username)) {
    return; // Silencioso para texto
  }

  try {
    const statusMsg = await bot.sendMessage(chatId, '✍️ Procesando tu mensaje...');
    
    // Procesar directo con IA
    const respuestaFinal = await procesarPeticionCalendario({ 
        text: msg.text,
        chatId: chatId
    });

    // Enviar respuesta final
    await bot.sendMessage(chatId, respuestaFinal, { parse_mode: 'Markdown' });
    
    // Borrar el mensaje de status temporal
    await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
    
  } catch (error) {
    console.error('Error al manejar el texto de Telegram:', error);
    bot.sendMessage(chatId, '⚠️ Hubo un error al procesar tu mensaje de texto.');
  }
}

module.exports = { handleTelegramMessage, handleTelegramTextMessage };
