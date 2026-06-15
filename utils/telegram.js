const axios = require('axios');

// Send an HTML-formatted message to a Telegram chat. No-op when chatId is falsy.
async function sendTelegram(chatId, htmlText) {
  if (!chatId) return;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('sendTelegram error:', err.message);
  }
}

module.exports = { sendTelegram };
