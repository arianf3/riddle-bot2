const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

class TelegramBot {
  constructor(token) {
    this.token = token;
    this.baseUrl = `${TELEGRAM_API_BASE}${token}`;
  }

  async call(method, payload = {}) {
    const url = `${this.baseUrl}/${method}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) {
        console.error(`Telegram API [${method}] Error:`, data.description);
      }
      return data;
    } catch (err) {
      console.error(`Network error calling Telegram [${method}]:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  async getMe() {
    return this.call('getMe');
  }

  async sendMessage(chatId, text, options = {}) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: options.parse_mode || 'HTML',
      reply_markup: options.reply_markup,
      disable_web_page_preview: options.disable_web_page_preview || false
    });
  }

  async sendPhoto(chatId, photoUrl, options = {}) {
    return this.call('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption: options.caption || '',
      parse_mode: options.parse_mode || 'HTML',
      reply_markup: options.reply_markup
    });
  }

  async sendVideo(chatId, videoUrl, options = {}) {
    return this.call('sendVideo', {
      chat_id: chatId,
      video: videoUrl,
      caption: options.caption || '',
      parse_mode: options.parse_mode || 'HTML',
      reply_markup: options.reply_markup,
      supports_streaming: true
    });
  }

  async sendVideoFile(chatId, filePath, options = {}) {
    const fs = require('fs');
    const path = require('path');
    const url = `${this.baseUrl}/sendVideo`;
    try {
      const form = new FormData();
      form.append('chat_id', chatId);
      const blob = await fs.openAsBlob(filePath);
      form.append('video', blob, path.basename(filePath));
      if (options.caption) form.append('caption', options.caption);
      if (options.parse_mode) form.append('parse_mode', options.parse_mode);
      if (options.supports_streaming) form.append('supports_streaming', 'true');
      if (options.reply_markup) {
        form.append('reply_markup', typeof options.reply_markup === 'string' ? options.reply_markup : JSON.stringify(options.reply_markup));
      }
      const res = await fetch(url, { method: 'POST', body: form });
      return await res.json();
    } catch (err) {
      console.error('sendVideoFile error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  async sendAudio(chatId, audioUrl, options = {}) {
    return this.call('sendAudio', {
      chat_id: chatId,
      audio: audioUrl,
      caption: options.caption || '',
      title: options.title || '',
      performer: options.performer || '',
      parse_mode: options.parse_mode || 'HTML',
      reply_markup: options.reply_markup
    });
  }

  async sendAudioFile(chatId, filePath, options = {}) {
    const fs = require('fs');
    const path = require('path');
    const url = `${this.baseUrl}/sendAudio`;
    try {
      const form = new FormData();
      form.append('chat_id', chatId);
      const blob = await fs.openAsBlob(filePath);
      form.append('audio', blob, path.basename(filePath));
      if (options.caption) form.append('caption', options.caption);
      if (options.title) form.append('title', options.title);
      if (options.performer) form.append('performer', options.performer);
      if (options.parse_mode) form.append('parse_mode', options.parse_mode);
      if (options.reply_markup) {
        form.append('reply_markup', typeof options.reply_markup === 'string' ? options.reply_markup : JSON.stringify(options.reply_markup));
      }
      const res = await fetch(url, { method: 'POST', body: form });
      return await res.json();
    } catch (err) {
      console.error('sendAudioFile error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  async sendDocument(chatId, document, options = {}) {
    return this.call('sendDocument', {
      chat_id: chatId,
      document: document,
      caption: options.caption || '',
      parse_mode: options.parse_mode || 'HTML',
      reply_markup: options.reply_markup
    });
  }

  async copyMessage(chatId, fromChatId, messageId, options = {}) {
    return this.call('copyMessage', {
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId,
      caption: options.caption,
      parse_mode: options.parse_mode || 'HTML',
      reply_markup: options.reply_markup
    });
  }

  async sendMediaGroup(chatId, media) {
    return this.call('sendMediaGroup', {
      chat_id: chatId,
      media: media
    });
  }

  async editMessageText(chatId, messageId, text, options = {}) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: options.parse_mode || 'HTML',
      reply_markup: options.reply_markup,
      disable_web_page_preview: options.disable_web_page_preview || false
    });
  }

  async deleteMessage(chatId, messageId) {
    return this.call('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  async answerCallbackQuery(callbackQueryId, options = {}) {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: options.text || '',
      show_alert: options.show_alert || false
    });
  }

  async getChatMember(chatId, userId) {
    return this.call('getChatMember', {
      chat_id: chatId,
      user_id: userId
    });
  }

  async setWebhook(url) {
    return this.call('setWebhook', {
      url: url,
      allowed_updates: ['message', 'callback_query']
    });
  }

  async deleteWebhook() {
    return this.call('deleteWebhook');
  }

  async getUpdates(offset = 0, timeout = 30) {
    return this.call('getUpdates', {
      offset: offset,
      timeout: timeout,
      allowed_updates: ['message', 'callback_query']
    });
  }
}

module.exports = TelegramBot;
