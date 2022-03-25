const Axios = require('axios');

class TelegramClient {
  constructor() {
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.$http = Axios.create({
      baseURL: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`,
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async sendMessage({ text }) {
    const res = await this.$http.request({
      url: '/sendMessage',
      method: 'POST',
      data: { chat_id: this.chatId, parse_mode: 'MarkdownV2', text },
    });

    return res.data;
  }

  async sendPhoto({ caption, photo }) {
    const res = await this.$http.request({
      url: '/sendPhoto',
      method: 'POST',
      data: { chat_id: this.chatId, parse_mode: 'MarkdownV2', caption, photo },
    });

    return res.data;
  }

  async sendMediaGroup({ caption, media }) {
    media[0].caption = caption;
    const res = await this.$http.request({
      url: '/sendMediaGroup',
      method: 'POST',
      data: { chat_id: this.chatId, parse_mode: 'MarkdownV2', media },
    });

    return res.data;
  }
}

module.exports = { TelegramClient };
