const fs = require("fs");
const path = require("path");

// Load .env file safely
try {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const val = match[2].trim().replace(/^["'](.*)["']$/, "$1");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (e) {}

const http = require('http');
const https = require('https');

// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN',
  AI_API_BASE: process.env.AI_API_BASE || 'http://127.0.0.1:20128/v1',
  AI_API_KEY: process.env.AI_API_KEY || 'YOUR_AI_API_KEY',
  AI_MODEL: process.env.AI_MODEL || 'ag/gemini-3.8-flash-low',
  PROXY_HOST: '127.0.0.1',
  PROXY_PORT: 20808,
  BOT_USERNAME: 'Gifty_buyapp_bot',
  MAX_HISTORY: 8,
  SYSTEM_PROMPT: `تو «🐍 ریدل (Riddle)» هستی؛ یک دستیار هوش مصنوعی نابغه، کاریزماتیک، به شدت باهوش و در عین حال شوخ‌طبع، رفیق و صمیمی (دقیقاً مثل سبک خرابکار).
ویژگی‌های کلیدی تو:
۱. زبان و لحن: کاملاً فارسی محاوره‌ای، روان، گرم و باحال. هیچ‌وقت رباتیک، خشک یا رسمی حرف نزن.
۲. تخصص‌ها: مسلط به برنامه‌نویسی، طراحی وب، امنیت، شبکه، بازی‌ها، علوم پایه و مسائل روزمره.
۳. در کدنویسی: کدهای تمیز، مدرن و با کامنت‌های مختصر بنویس و داخل بلوک‌های کد استاندارد قرار بده.
۴. شوخ‌طبعی: حاضرجواب، تیز و باانرژی باش، ولی همیشه بااحترام و کمک‌کننده.
۵. خلاصه و رسا: پاسخ‌ها را متناسب با سوال کاربر بده، زیاده‌گویی نکن مگر اینکه توضیح فنی لازم باشد.`
};

// In-memory conversation context: chatId -> array of {role, content}
const chatHistories = new Map();

// ==========================================
// TELEGRAM HTTP CLIENT VIA LOCAL PROXY
// ==========================================
function callTelegram(method, payload = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    
    // Connect to Telegram API via CONNECT tunnel over local proxy
    const connectReq = http.request({
      host: CONFIG.PROXY_HOST,
      port: CONFIG.PROXY_PORT,
      method: 'CONNECT',
      path: 'api.telegram.org:443'
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Proxy CONNECT failed: ${res.statusCode}`));
      }

      const agent = new https.Agent({ socket });
      const req = https.request({
        host: 'api.telegram.org',
        path: `/bot${CONFIG.TELEGRAM_TOKEN}/${method}`,
        method: 'POST',
        agent: agent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (apiRes) => {
        let body = '';
        apiRes.on('data', chunk => body += chunk);
        apiRes.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ ok: false, error: body });
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });

    connectReq.on('error', reject);
    connectReq.end();
  });
}

// ==========================================
// CALL LOCAL AI (9ROUTER GEMINI 3.8 FLASH)
// ==========================================
function callAI(chatId, userPrompt) {
  return new Promise((resolve, reject) => {
    // 1. Get or create history
    let history = chatHistories.get(chatId) || [];
    
    // Build messages array
    const messages = [
      { role: 'system', content: CONFIG.SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userPrompt }
    ];

    const postData = JSON.stringify({
      model: CONFIG.AI_MODEL,
      messages: messages,
      stream: false,
      temperature: 0.7
    });

    const parsedUrl = new URL(CONFIG.AI_API_BASE + '/chat/completions');
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.AI_API_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.choices && json.choices.length > 0) {
            const reply = json.choices[0].message?.content || 'پاسخی دریافت نشد.';
            
            // Save to history
            history.push({ role: 'user', content: userPrompt });
            history.push({ role: 'assistant', content: reply });
            if (history.length > CONFIG.MAX_HISTORY * 2) {
              history = history.slice(-CONFIG.MAX_HISTORY * 2);
            }
            chatHistories.set(chatId, history);

            resolve(reply);
          } else if (json.error) {
            resolve(`❌ خطای مدل هوش مصنوعی: ${json.error.message || JSON.stringify(json.error)}`);
          } else {
            resolve('❌ پاسخی از مدل هوش مصنوعی دریافت نشد.');
          }
        } catch (e) {
          resolve(`❌ خطا در پردازش پاسخ هوش مصنوعی: ${e.message}`);
        }
      });
    });

    req.on('error', (err) => {
      resolve(`❌ خطا در برقراری ارتباط با هسته هوش مصنوعی (۹روتر): ${err.message}`);
    });

    req.write(postData);
    req.end();
  });
}

// Split long Telegram messages
async function sendLongMessage(chatId, text, replyToId = null) {
  const MAX_LEN = 4000;
  if (text.length <= MAX_LEN) {
    return callTelegram('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      reply_to_message_id: replyToId
    }).catch(() => {
      // Fallback without parse_mode if Markdown parsing fails
      return callTelegram('sendMessage', {
        chat_id: chatId,
        text: text,
        reply_to_message_id: replyToId
      });
    });
  }

  // Chunking
  for (let i = 0; i < text.length; i += MAX_LEN) {
    const chunk = text.slice(i, i + MAX_LEN);
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: chunk,
      parse_mode: 'Markdown',
      reply_to_message_id: i === 0 ? replyToId : null
    }).catch(() => {
      return callTelegram('sendMessage', {
        chat_id: chatId,
        text: chunk,
        reply_to_message_id: i === 0 ? replyToId : null
      });
    });
  }
}

// ==========================================
// MESSAGE HANDLER
// ==========================================
async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || (!msg.text && !msg.caption)) return;

  const chatId = msg.chat.id;
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  const text = (msg.text || msg.caption || '').trim();
  const messageId = msg.message_id;
  const fromUser = msg.from ? (msg.from.first_name || 'کاربر') : 'کاربر';

  // 1. Command: /start
  if (text === '/start') {
    chatHistories.delete(chatId);
    const welcome =
      `سلام *${fromUser}* عزیز! 🐍✨\n\n` +
      `من *ریدل (Riddle)* هستم؛ دستیار هوش مصنوعی همه‌چیزدان و شوخ‌طبع مجهز به مغز قدرتمند *Google Gemini 3.8 Flash*! 🧠⚡️\n\n` +
      `🔥 *کارهایی که برات انجام میدم:*\n` +
      `• پاسخ به هر سوال علمی، عمومی، برنامه‌نویسی و فناوری\n` +
      `• نوشتن، عیب‌یابی و بهینه‌سازی کدهای پایتون، جاوااسکریپت و...\n` +
      `• چت و شوخی در گروه‌ها و چت‌های دوستانه\n` +
      `• ارائه پیشنهادات تخصصی و حل مسائل پیچیده\n\n` +
      `👇 *نحوه استفاده:*\n` +
      `• توی پیوی هر چی دلت می‌خواد بنویس تا بلافاصله جوابت رو بدم!\n` +
      `• توی گروه‌ها من رو منشن کن، یا روی پیامم ریپلای بزن، یا بنویس: \`/ask سوالت\``;

    return callTelegram('sendMessage', {
      chat_id: chatId,
      text: welcome,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📢 کانال رسمی RadProtocol', url: 'https://t.me/rad_protocol' },
            { text: '🎬 وب‌اپلیکیشن دابل پلیر', url: 'https://arianf3.github.io/dumble-player/' }
          ],
          [
            { text: '🔄 پاکسازی حافظه مکالمه', callback_data: 'reset_chat' },
            { text: 'ℹ️ وضعیت مدل', callback_data: 'model_info' }
          ]
        ]
      }
    });
  }

  // 2. Command: /reset or /clear
  if (text === '/reset' || text === '/clear') {
    chatHistories.delete(chatId);
    return callTelegram('sendMessage', {
      chat_id: chatId,
      text: '🧹 *حافظه مکالمه جاری پاکسازی شد!* از الان یک گفتگوی جدید رو شروع می‌کنیم.',
      parse_mode: 'Markdown',
      reply_to_message_id: messageId
    });
  }

  // 3. Command: /model
  if (text === '/model') {
    const info =
      `🧠 *اطلاعات مدل هوش مصنوعی ریدل:*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `• *مدل:* \`${CONFIG.AI_MODEL}\`\n` +
      `• *توسعه‌دهنده هسته:* Google DeepMind (Gemini 3.8 Flash)\n` +
      `• *نوع مصرف:* نسخه بهینه و فوق سریع (Low-Latency / Optimized)\n` +
      `• *موتور ارتباطی:* 9router Relay Hub\n` +
      `• *وضعیت سرویس:* آنلاین و فعال 🟢`;
    return callTelegram('sendMessage', {
      chat_id: chatId,
      text: info,
      parse_mode: 'Markdown',
      reply_to_message_id: messageId
    });
  }

  // 4. Command: /help
  if (text === '/help') {
    const helpText =
      `📖 *راهنمای استفاده از ربات هوش مصنوعی ریدل (Riddle):*\n\n` +
      `💬 *در چت شخصی (پیوی):*\n` +
      `فقط کافیه هر سوالی یا درخواستی داری رو به صورت عادی بفرستی.\n\n` +
      `👥 *در گروه‌ها و سوپرگروه‌ها:*\n` +
      `برای اینکه ربات در گروه شلوغی ایجاد نکنه، فقط به پیام‌هایی جواب میده که:\n` +
      `۱. روی پیام ربات *ریپلای (Reply)* بزنید.\n` +
      `۲. ربات رو منشن کنید (مثلاً: \`@${CONFIG.BOT_USERNAME}\` یا کلمه *«ریدل»*).\n` +
      `۳. اول پیامتون بنویسید: \`/ask <متن سوال>\`\n\n` +
      `⚙️ *دستورات کاربردی:*\n` +
      `• \`/reset\` - پاک کردن تاریخچه چت فعلی\n` +
      `• \`/model\` - نمایش مدل هوش مصنوعی فعال\n` +
      `• \`/ping\` - تست سرعت و پینگ ربات`;
    return callTelegram('sendMessage', {
      chat_id: chatId,
      text: helpText,
      parse_mode: 'Markdown',
      reply_to_message_id: messageId
    });
  }

  // 5. Command: /ping
  if (text === '/ping') {
    const start = Date.now();
    const sent = await callTelegram('sendMessage', {
      chat_id: chatId,
      text: '🏓 در حال سنجش پینگ...',
      reply_to_message_id: messageId
    });
    const ping = Date.now() - start;
    if (sent.ok) {
      return callTelegram('editMessageText', {
        chat_id: chatId,
        message_id: sent.result.message_id,
        text: `🏓 *پونگ!* زمان رفت و برگشت: \`${ping}ms\` ⚡️\nهسته هوش مصنوعی کاملاً پایدار است.`,
        parse_mode: 'Markdown'
      });
    }
    return;
  }

  // 6. Check if bot should respond
  let shouldReply = false;
  let userQuery = text;

  if (chatType === 'private') {
    shouldReply = true;
  } else {
    // In groups
    const isReplyToBot = msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.is_bot;
    const isMentioned = text.includes(`@${CONFIG.BOT_USERNAME}`) || text.toLowerCase().includes('ریدل') || text.toLowerCase().includes('riddle');
    const isAskCmd = text.startsWith('/ask');

    if (isReplyToBot || isMentioned || isAskCmd) {
      shouldReply = true;
      // Clean query
      userQuery = text
        .replace(new RegExp(`@${CONFIG.BOT_USERNAME}`, 'gi'), '')
        .replace(/^\/ask\s*/i, '')
        .trim();
    }
  }

  if (!shouldReply || !userQuery) return;

  // Show typing indicator
  callTelegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

  // Call AI
  const aiAnswer = await callAI(chatId, userQuery);

  // Send reply
  await sendLongMessage(chatId, aiAnswer, messageId);
}

// Callback Query Handler
async function handleCallback(cq) {
  const cqId = cq.id;
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const data = cq.data;

  if (data === 'reset_chat') {
    chatHistories.delete(chatId);
    await callTelegram('answerCallbackQuery', {
      callback_query_id: cqId,
      text: '🧹 حافظه مکالمه با موفقیت پاک شد!',
      show_alert: true
    });
  } else if (data === 'model_info') {
    await callTelegram('answerCallbackQuery', {
      callback_query_id: cqId,
      text: `مدل هوش مصنوعی: ${CONFIG.AI_MODEL} (Google Gemini 3.8 Flash)`,
      show_alert: true
    });
  } else {
    await callTelegram('answerCallbackQuery', { callback_query_id: cqId });
  }
}

// ==========================================
// LONG-POLLING ENGINE
// ==========================================
let lastUpdateId = 0;
let isPolling = false;

async function pollUpdates() {
  if (isPolling) return;
  isPolling = true;

  try {
    const res = await callTelegram('getUpdates', {
      offset: lastUpdateId + 1,
      timeout: 25,
      allowed_updates: ['message', 'callback_query']
    });

    if (res.ok && Array.isArray(res.result)) {
      for (const update of res.result) {
        lastUpdateId = update.update_id;
        try {
          if (update.message) {
            await handleUpdate(update);
          } else if (update.callback_query) {
            await handleCallback(update.callback_query);
          }
        } catch (err) {
          console.error('Error handling update:', err);
        }
      }
    }
  } catch (err) {
    console.error('Polling error:', err.message);
    await new Promise(r => setTimeout(r, 3000));
  } finally {
    isPolling = false;
    setImmediate(pollUpdates);
  }
}

// ==========================================
// MAIN BOOTSTRAP
// ==========================================
async function main() {
  console.log('🐍 Riddle AI Bot is starting...');
  console.log(`🤖 AI Model: ${CONFIG.AI_MODEL}`);
  console.log(`🌐 AI Endpoint: ${CONFIG.AI_API_BASE}`);

  // Test Telegram connection
  try {
    const me = await callTelegram('getMe');
    if (!me.ok) {
      console.error('❌ Failed to connect to Telegram:', me);
      process.exit(1);
    }
    console.log(`✅ Connected to Telegram! Bot: @${me.result.username} (${me.result.first_name})`);

    // Remove any webhook before long-polling
    await callTelegram('deleteWebhook', { drop_pending_updates: true });

    console.log('🚀 Long-polling started! Ready for messages...');
    pollUpdates();
  } catch (e) {
    console.error('Boot error:', e);
  }
}

main();
