const TelegramBot = require('node-telegram-bot-api');
const { handleTelegramMessage, handleTelegramTextMessage } = require('../services/telegram');

const token = process.env.TELEGRAM_BOT_TOKEN;
// En Vercel no usamos polling: true
const bot = new TelegramBot(token, { polling: false });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Bot Running');
  }

  try {
    const { body } = req;

    // Comando /start
    if (body.message && body.message.text === '/start') {
      const chatId = body.message.chat.id;
      await bot.sendMessage(chatId, '¡Hola! Soy tu asistente de agenda inteligente (Modo Vercel). Envíame un mensaje de voz o texto y agendaré o consultaré eventos para ti en Google Calendar.');
      return res.status(200).send('OK');
    }

    // Mensajes de Voz
    if (body.message && body.message.voice) {
      await handleTelegramMessage(bot, body.message);
      return res.status(200).send('OK');
    }

    // Mensajes de Texto
    if (body.message && body.message.text) {
      // Ignorar comandos que no sean /start
      if (!body.message.text.startsWith('/')) {
        await handleTelegramTextMessage(bot, body.message);
      }
      return res.status(200).send('OK');
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('Error in Webhook Handler:', error);
    // Siempre respondemos 200 para que Telegram no reintente infinitamente
    return res.status(200).send('OK');
  }
}
