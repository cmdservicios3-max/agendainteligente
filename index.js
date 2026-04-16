require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { handleTelegramMessage, handleTelegramTextMessage } = require('./services/telegram');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Bot de Agenda Inteligente iniciado y modo Polling activo.');

// Comando de inicio
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '¡Hola! Soy tu asistente de agenda inteligente. Envíame un mensaje de voz o texto y agendaré o consultaré eventos para ti en Google Calendar.');
});

// Manejo de mensajes de voz
bot.on('voice', async (msg) => {
  await handleTelegramMessage(bot, msg);
});

// Manejo de mensajes de texto (que no sean comandos)
bot.on('message', async (msg) => {
  if (msg.text && !msg.text.startsWith('/')) {
    await handleTelegramTextMessage(bot, msg);
  }
});

// Manejo de errores de polling
bot.on('polling_error', (error) => {
  console.log('Error de Polling:', error.message);  
});
