const axios = require('axios');

// Send an HTML-formatted message to a Telegram chat. No-op when chatId is falsy.
// When replyMarkup is provided it is attached as reply_markup (e.g. inline keyboard).
async function sendTelegram(chatId, htmlText, replyMarkup = null) {
  if (!chatId) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const body = {
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML'
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    await axios.post(url, body);
  } catch (err) {
    console.error('sendTelegram error:', err.message);
  }
}

// Acknowledge a callback query (the toast shown after tapping an inline button).
async function answerCallbackQuery(callbackQueryId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  try {
    await axios.post(url, {
      callback_query_id: callbackQueryId,
      text
    });
  } catch (err) {
    console.error('answerCallbackQuery error:', err.message);
  }
}

// Replace the text of an existing message (HTML formatted).
async function editMessageText(chatId, messageId, htmlText) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/editMessageText`;
  try {
    await axios.post(url, {
      chat_id: chatId,
      message_id: messageId,
      text: htmlText,
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('editMessageText error:', err.message);
  }
}

module.exports = { sendTelegram, answerCallbackQuery, editMessageText };
