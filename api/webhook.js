const TelegramBot = require('node-telegram-bot-api');
const { handleTelegramMessage, handleTelegramTextMessage } = require('../services/telegram');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: false });

module.exports = async (req, res) => {
  // Solo aceptamos POST (que es lo que manda Telegram)
  if (req.method !== 'POST') {
    return res.status(200).send('Bot is online');
  }

  try {
    const { body } = req;

    if (!body || !body.message) {
      return res.status(200).send('No message received');
    }

    const { message } = body;
    const chatId = message.chat.id;

    // 1. Comando /start
    if (message.text === '/start') {
      await bot.sendMessage(chatId, '¡Hola! Soy tu asistente de agenda inteligente (Modo Vercer). Envíame un mensaje de voz o texto y agendaré o consultaré eventos para ti.');
      return res.status(200).send('OK');
    }

    // 2. Mensajes de Voz
    if (message.voice) {
      await handleTelegramMessage(bot, message);
      return res.status(200).send('OK');
    }

    // 3. Mensajes de Texto
    if (message.text && !message.text.startsWith('/')) {
      await handleTelegramTextMessage(bot, message);
      return res.status(200).send('OK');
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('Error en Webhook:', error);
    return res.status(200).send('Error');
  }
};
