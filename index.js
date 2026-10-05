const http = require('http');
const https = require('https');
const TelegramBot = require('./telegram');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '8839028026:AAH5Z8721lM8Kj08F597u31X091j7Gg71h0';
const REQUIRED_CHANNEL = '@rad_protocol';
const CHANNEL_LINK = 'https://t.me/rad_protocol';
const SUPPORT_GROUP = 'https://t.me/radprotocoll';
const WEBAPP_URL = 'https://arianf3.github.io/dumble-player/';

const bot = new TelegramBot(TELEGRAM_TOKEN);

// Check if user is a member of the required channel
async function isChannelMember(userId) {
  try {
    const res = await bot.getChatMember(REQUIRED_CHANNEL, userId);
    if (!res.ok) {
      console.warn(`Could not verify membership for ${userId}:`, res.description);
      return false;
    }
    const status = res.result.status;
    return ['creator', 'administrator', 'member', 'restricted'].includes(status);
  } catch (err) {
    console.error('Membership check failed:', err.message);
    return false;
  }
}

// UI: Join Requirement
function getJoinMessage(name) {
  return (
    `سلام <b>${name || 'کاربر عزیز'}</b>! 📺\n\n` +
    `🔒 <b>برای دسترسی به تلویزیون آنلاین دامبل پلیر (پخش زنده شبکه‌ها)، لطفاً ابتدا عضو کانال ما شوید:</b>\n\n` +
    `📢 <b>کانال:</b> ${REQUIRED_CHANNEL}\n\n` +
    `👇 پس از عضویت روی <b>«تایید عضویت ✅»</b> بزنید تا پلیر براتون باز بشه:`
  );
}

function getJoinMarkup() {
  return {
    inline_keyboard: [
      [{ text: '📢 عضویت در کانال RadProtocol', url: CHANNEL_LINK }],
      [{ text: '✅ تایید عضویت', callback_data: 'verify_join' }]
    ]
  };
}

// UI: Main Menu for TV Player
function getMainMenuMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '▶️ ورود به تلویزیون و تماشای آنلاین (Play)', web_app: { url: WEBAPP_URL } }
      ],
      [
        { text: '⚽️ پخش زنده فوتبال', web_app: { url: WEBAPP_URL } },
        { text: '📺 شبکه‌های سراسری', web_app: { url: WEBAPP_URL } }
      ],
      [
        { text: '📡 شبکه‌های ماهواره‌ای', web_app: { url: WEBAPP_URL } },
        { text: '🎬 فیلم و سریال', web_app: { url: WEBAPP_URL } }
      ],
      [
        { text: '🎵 موزیک ۲۴ ساعته', web_app: { url: WEBAPP_URL } },
        { text: '🌐 شبکه‌های خارجی (US/UK)', web_app: { url: WEBAPP_URL } }
      ],
      [
        { text: '🔞 بخش بزرگسالان (+18)', web_app: { url: WEBAPP_URL } },
        { text: '📱 راهنمای تماشا و کیفیت', web_app: { url: WEBAPP_URL } }
      ],
      [
        { text: '📢 کانال رسمی (@rad_protocol)', url: CHANNEL_LINK },
        { text: '👥 گروه پشتیبانی و چت', url: SUPPORT_GROUP }
      ]
    ]
  };
}

function getStartMessage(name) {
  return (
    `سلام <b>${name || 'کاربر عزیز'}</b>! 📺✨\n` +
    `به <b>دامبل پلیر (Dumble TV Player)</b> خوش آمدید.\n\n` +
    `⚡️ <b>پخش زنده شبکه‌های تلویزیونی کاملاً رایگان، بدون تبلیغات و پرسرعت در تلگرام:</b>\n\n` +
    `• ⚽️ <b>پخش زنده مسابقات ورزشی و فوتبال اروپا</b>\n` +
    `• 📺 <b>تمام شبکه‌های سراسری و استانی صداوسیما</b>\n` +
    `• 📡 <b>شبکه‌های ماهواره‌ای فارسی‌زبان و سرگرمی</b>\n` +
    `• 🎬 <b>شبکه‌های ۲۴ ساعته فیلم، سریال و انیمیشن</b>\n` +
    `• 🎵 <b>کانال‌های موزیک ویدیو و کنسرت</b>\n` +
    `• 🌐 <b>شبکه‌های برتر بین‌المللی (US/UK)</b>\n` +
    `• 🔞 <b>دسترسی رمزدار به بخش +18</b>\n\n` +
    `👇 <b>برای شروع تماشا یکی از گزینه‌های زیر را انتخاب کنید:</b>`
  );
}

// Handle Incoming Updates
async function handleUpdate(update) {
  try {
    // 1. Handle Callback Queries
    if (update.callback_query) {
      const cq = update.callback_query;
      const userId = cq.from.id;
      const data = cq.data;
      const chatId = cq.message ? cq.message.chat.id : userId;
      const messageId = cq.message ? cq.message.message_id : null;

      db.registerUser(cq.from);

      // Membership Verification
      if (data === 'verify_join') {
        const joined = await isChannelMember(userId);
        if (joined) {
          await bot.answerCallbackQuery(cq.id, {
            text: 'عضویت شما تایید شد! به دامبل پلیر خوش آمدید 🌹',
            show_alert: true
          });
          if (messageId) {
            await bot.editMessageText(chatId, messageId, getStartMessage(cq.from.first_name), {
              reply_markup: getMainMenuMarkup()
            });
          } else {
            await bot.sendMessage(chatId, getStartMessage(cq.from.first_name), {
              reply_markup: getMainMenuMarkup()
            });
          }
        } else {
          await bot.answerCallbackQuery(cq.id, {
            text: '❌ شما هنوز عضو کانال نشده‌اید! لطفاً ابتدا عضو کانال شوید و سپس مجدداً کلیک کنید.',
            show_alert: true
          });
        }
        return;
      }

      if (data === 'menu_adult_info') {
        await bot.answerCallbackQuery(cq.id);
        const adultText = (
          `🔞 <b>بخش محتوای بزرگسالان (+18) دامبل پلیر</b>\n\n` +
          `این بخش به صورت محافظت‌شده و قفل‌دار در وب‌اپ قرار دارد.\n` +
          `برای دسترسی، پلیر را باز کنید و در منوی انتخاب منابع، گزینه <b>🔞 کانال‌های بزرگسالان (+18)</b> را انتخاب کنید.\n\n` +
          `🔑 <b>رمز ورود به این بخش:</b> <code>18</code>`
        );
        const adultMarkup = {
          inline_keyboard: [
            [{ text: '🔞 ورود به وب‌اپ دامبل پلیر', web_app: { url: WEBAPP_URL } }],
            [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu_main' }]
          ]
        };
        if (messageId) {
          await bot.editMessageText(chatId, messageId, adultText, { reply_markup: adultMarkup });
        } else {
          await bot.sendMessage(chatId, adultText, { reply_markup: adultMarkup });
        }
        return;
      }

      if (data === 'menu_guide') {
        await bot.answerCallbackQuery(cq.id);
        const guideText = (
          `📱 <b>راهنمای استفاده و تنظیم کیفیت دامبل پلیر</b>\n\n` +
          `🔹 <b>پخش روان و بدون لگ:</b>\n` +
          `• در پلیر روی آیکون ⚙️ بزنید و کیفیت مناسب با سرعت اینترنت خود را انتخاب کنید.\n\n` +
          `🔹 <b>حالت تمام‌صفحه (Full Screen):</b>\n` +
          `• گوشی را به صورت افقی بچرخانید و روی علامت ⛶ بزنید.\n\n` +
          `🔹 <b>جستجوی سریع شبکه:</b>\n` +
          `• در بالای لیست کانال‌ها، نام شبکه مورد نظر (مثل <i>ورزش</i> یا <i>منوتو</i>) را سرچ کنید.\n\n` +
          `👇 <b>برای شروع تماشا روی دکمه زیر کلیک کنید:</b>`
        );
        const guideMarkup = {
          inline_keyboard: [
            [{ text: '📺 ورود به تلویزیون دامبل پلیر', web_app: { url: WEBAPP_URL } }],
            [{ text: '🔙 بازگشت به منوی اصلی', callback_data: 'menu_main' }]
          ]
        };
        if (messageId) {
          await bot.editMessageText(chatId, messageId, guideText, { reply_markup: guideMarkup });
        } else {
          await bot.sendMessage(chatId, guideText, { reply_markup: guideMarkup });
        }
        return;
      }

      if (data === 'menu_main') {
        await bot.answerCallbackQuery(cq.id);
        if (messageId) {
          await bot.editMessageText(chatId, messageId, getStartMessage(cq.from.first_name), {
            reply_markup: getMainMenuMarkup()
          });
        } else {
          await bot.sendMessage(chatId, getStartMessage(cq.from.first_name), {
            reply_markup: getMainMenuMarkup()
          });
        }
        return;
      }

      await bot.answerCallbackQuery(cq.id);
      return;
    }

    // 2. Handle Text Messages
    if (update.message && update.message.text) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const text = msg.text.trim();

      db.registerUser(msg.from);

      // Channel Membership Check
      const joined = await isChannelMember(userId);
      if (!joined) {
        await bot.sendMessage(chatId, getJoinMessage(msg.from.first_name), {
          reply_markup: getJoinMarkup()
        });
        return;
      }

      // /start command
      if (text.startsWith('/start') || text === '/play' || text === '/tv') {
        await bot.sendMessage(chatId, getStartMessage(msg.from.first_name), {
          reply_markup: getMainMenuMarkup()
        });
        return;
      }

      // Default response
      await bot.sendMessage(chatId, `📺 برای تماشای تلویزیون زنده روی دکمه زیر کلیک کنید:`, {
        reply_markup: getMainMenuMarkup()
      });
      return;
    }
  } catch (err) {
    console.error('Error handling update:', err);
  }
}

// HTTP Server for Webhook and Keep-Alive
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health Check / Ping
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'dumble-tv-player-bot',
      version: '4.0.0',
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Telegram Webhook Endpoint
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        if (body) {
          const update = JSON.parse(body);
          await handleUpdate(update);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('Error parsing webhook update:', err);
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

function startKeepAlive(appUrl) {
  if (!appUrl) return;
  const interval = 14 * 60 * 1000;
  setInterval(() => {
    try {
      const client = appUrl.startsWith('https') ? https : http;
      client.get(`${appUrl}/health`, res => {
        console.log(`[Keep-Alive] Pinged ${appUrl}/health - Status: ${res.statusCode}`);
      }).on('error', err => {
        console.warn(`[Keep-Alive] Ping failed:`, err.message);
      });
    } catch (e) {
      console.error('[Keep-Alive] Error:', e.message);
    }
  }, interval);
}

async function init() {
  server.listen(PORT, async () => {
    console.log(`Dumble TV Player Bot running on port ${PORT}`);

    const APP_URL = process.env.RENDER_EXTERNAL_URL || 'https://rad-downloader-bot.onrender.com';
    const WEBHOOK_URL = `${APP_URL}/webhook`;

    try {
      const webhookRes = await bot.setWebhook(WEBHOOK_URL);
      if (webhookRes.ok) {
        console.log(`Telegram Webhook set successfully to: ${WEBHOOK_URL}`);
      } else {
        console.warn(`Failed to set webhook:`, webhookRes.description);
      }
    } catch (e) {
      console.error('Webhook setup error:', e.message);
    }

    startKeepAlive(APP_URL);
  });
}

init();
