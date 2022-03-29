const { HttpClient } = require('./HttpClient');

class TelegramClient {
  constructor() {
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.$http = new HttpClient({
      baseURL: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`,
      timeout: 50000,
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

  async sendMediaGroup({ caption, medias }) {
    const mediaPhotos = medias.map((media) => ({
      type: 'photo',
      media,
      parse_mode: 'MarkdownV2',
    }));
    mediaPhotos[0].caption = caption;

    const res = await this.$http.request({
      url: '/sendMediaGroup',
      method: 'POST',
      data: { chat_id: this.chatId, parse_mode: 'MarkdownV2', media: mediaPhotos },
    });

    return res.data;
  }
}

module.exports = { TelegramClient };
