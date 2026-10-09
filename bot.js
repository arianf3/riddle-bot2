const fs = require("fs");
const path = require("path");
const http = require('http');
const https = require('https');
const { exec } = require('child_process');

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
  OWNER_IDS: ['8602316735', '8678906046', '7746536015', '8709663394'],
  SYSTEM_PROMPT: `تو «🐍 ریدل (Riddle)» هستی؛ یک دستیار هوش مصنوعی نابغه، کاریزماتیک، به شدت باهوش و در عین حال شوخ‌طبع، رفیق و صمیمی (دقیقاً مثل سبک خرابکار).
ویژگی‌های کلیدی تو:
۱. زبان و لحن: کاملاً فارسی محاوره‌ای، روان، گرم و باحال. هیچ‌وقت رباتیک، خشک یا رسمی حرف نزن.
۲. تخصص‌ها: مسلط به برنامه‌نویسی، طراحی وب، لینوکس، ترمینال، شبکه، امنیت، بازی‌ها و علوم روزمره.
۳. در کدنویسی: کدهای تمیز، مدرن و با کامنت‌های مختصر بنویس و داخل بلوک‌های کد استاندارد قرار بده.
۴. تحلیل تصاویر: تو قابلیت بینایی ماشین (Vision) داری و تصاویر ارسالی را به طور کامل می‌بینی و با جزئیات تحلیل می‌کنی.
۵. شوخ‌طبعی: حاضرجواب، تیز و باانرژی باش، ولی همیشه بااحترام و کمک‌کننده.
۶. اگر مالک ربات دستوری برای اجرا در ترمینال یا دستکاری کد خواست، می‌توانی دستور لینوکس را در بلوک \`\`\`bash قرار دهی تا سیستم به صورت خودکار آن را اجرا کرده و خروجی را اضافه کند.`
};

// In-memory conversation context: chatId -> array of {role, content}
const chatHistories = new Map();

function isOwner(userId) {
  return CONFIG.OWNER_IDS.includes(String(userId));
}

// ==========================================
// TELEGRAM HTTP CLIENT VIA LOCAL PROXY
// ==========================================
function callTelegram(method, payload = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    
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

// Download Telegram file buffer via proxy
function downloadTelegramFile(filePath) {
  return new Promise((resolve, reject) => {
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
        path: `/file/bot${CONFIG.TELEGRAM_TOKEN}/${filePath}`,
        method: 'GET',
        agent: agent
      }, (apiRes) => {
        const chunks = [];
        apiRes.on('data', chunk => chunks.push(chunk));
        apiRes.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      });

      req.on('error', reject);
      req.end();
    });

    connectReq.on('error', reject);
    connectReq.end();
  });
}

// ==========================================
// TERMINAL RUNNER (FOR OWNER)
// ==========================================
function runTerminal(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: '/root', timeout: 45000, maxBuffer: 1024 * 1024 * 2 }, (error, stdout, stderr) => {
      let out = (stdout || '').trim();
      let err = (stderr || '').trim();
      let res = '';
      if (out) res += out;
      if (err) res += (res ? '\n[STDERR]\n' : '') + err;
      if (error && !err) res += (res ? '\n' : '') + `Exit: ${error.message}`;
      if (!res) res = '✅ دستور با موفقیت و بدون خروجی اجرا شد (Exit Code: 0)';
      resolve(res);
    });
  });
}

// ==========================================
// CALL LOCAL AI (9ROUTER GEMINI 3.8 FLASH)
// ==========================================
function callAI(chatId, userPrompt, imageBuffer = null) {
  return new Promise((resolve, reject) => {
    let history = chatHistories.get(chatId) || [];
    
    let userMsgContent;
    if (imageBuffer) {
      const b64 = imageBuffer.toString('base64');
      userMsgContent = [
        {
          type: 'text',
          text: userPrompt || 'این تصویر را با دقت بررسی و تحلیل کن و تمام جزئیات یا متون آن را به زبان فارسی توضیح بده.'
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${b64}` }
        }
      ];
    } else {
      userMsgContent = userPrompt;
    }

    const messages = [
      { role: 'system', content: CONFIG.SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userMsgContent }
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
      timeout: 45000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.choices && json.choices.length > 0) {
            const reply = json.choices[0].message?.content || 'پاسخی دریافت نشد.';
            
            // Save clean text summary to history (avoid bloated b64 in memory)
            history.push({ role: 'user', content: userPrompt || '[تصویر ارسال شد]' });
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
      return callTelegram('sendMessage', {
        chat_id: chatId,
        text: text,
        reply_to_message_id: replyToId
      });
    });
  }

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
  if (!msg) return;

  const chatId = msg.chat.id;
  const chatType = msg.chat.type; // 'private', 'group', 'supergroup'
  const text = (msg.text || msg.caption || '').trim();
  const messageId = msg.message_id;
  const fromId = msg.from ? msg.from.id : chatId;
  const fromUser = msg.from ? (msg.from.first_name || 'کاربر') : 'کاربر';
  const hasPhoto = Array.isArray(msg.photo) && msg.photo.length > 0;

  if (!text && !hasPhoto) return;

  // ================= ADMIN / TERMINAL COMMANDS =================
  if (text.startsWith('/sh ') || text.startsWith('/exec ') || text.startsWith('/bash ')) {
    if (!isOwner(fromId)) {
      return callTelegram('sendMessage', {
        chat_id: chatId,
        text: '⛔️ دسترسی غیرمجاز. این قابلیت فقط مخصوص مالک ربات است.',
        reply_to_message_id: messageId
      });
    }

    const cmd = text.replace(/^(\/sh|\/exec|\/bash)\s+/i, '').trim();
    callTelegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const out = await runTerminal(cmd);
    const replyText = `💻 *دستور لینوکس:*\n\`${cmd}\`\n\n*خروجی:*\n\`\`\`\n${out.slice(0, 3800)}\n\`\`\``;
    return sendLongMessage(chatId, replyText, messageId);
  }

  // /cat <filepath>
  if (text.startsWith('/cat ')) {
    if (!isOwner(fromId)) return;
    const targetPath = text.replace('/cat ', '').trim();
    try {
      const content = fs.readFileSync(path.resolve(targetPath), 'utf-8');
      return sendLongMessage(chatId, `📄 *محتوای فایل:* \`${targetPath}\`\n\n\`\`\`\n${content.slice(0, 3800)}\n\`\`\``, messageId);
    } catch (e) {
      return callTelegram('sendMessage', {
        chat_id: chatId,
        text: `❌ خطا در خواندن فایل: ${e.message}`,
        reply_to_message_id: messageId
      });
    }
  }

  // /ls [dir]
  if (text === '/ls' || text.startsWith('/ls ')) {
    if (!isOwner(fromId)) return;
    const targetDir = text === '/ls' ? '/root' : text.replace('/ls ', '').trim();
    const out = await runTerminal(`ls -la "${targetDir}"`);
    return sendLongMessage(chatId, `📁 *محتوای دایرکتوری:* \`${targetDir}\`\n\n\`\`\`\n${out}\n\`\`\``, messageId);
  }

  // 1. Command: /start
  if (text === '/start') {
    chatHistories.delete(chatId);
    const welcome =
      `سلام *${fromUser}* عزیز! 🐍✨\n\n` +
      `من *ریدل (Riddle)* هستم؛ دستیار هوش مصنوعی همه‌چیزدان، مجهز به بینایی ماشین (Vision)، ترمینال لینوکس و مغز قدرتمند *Google Gemini 3.8 Flash*! 🧠⚡️\n\n` +
      `🔥 *کارهایی که برات انجام میدم:*\n` +
      `• 🖼 *دیدن و تحلیل عکس‌ها:* هر عکسی رو بفرستی با توضیحات یا سوال، مو‌به‌مو می‌خونم و تحلیل می‌کنم!\n` +
      `• 💻 *برنامه‌نویسی و کدنویسی:* نوشتن، دیباگ و اصلاح انواع زبان‌ها\n` +
      `• ⚡️ *اجرای ترمینال:* اجرای مستقیم دستورات شل لینوکس (برای مالک با \`/sh <دستور>\`)\n` +
      `• 👥 *چت و سرگرمی در گروه‌ها*\n\n` +
      `👇 *نحوه استفاده:*\n` +
      `• توی پیوی متن یا عکس بفرست تا درجا جواب بدم!\n` +
      `• توی گروه‌ها ریپلای بزن، یا منشن کن، یا بنویس: \`/ask سوالت\``;

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
      `• *قابلیت بینایی ماشین (Vision):* فعال ✅ (پشتیبانی از عکس‌ها)\n` +
      `• *ترمینال لینوکس:* فعال ✅ (ویژه مالک با \`/sh\`)\n` +
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
      `• هر سوال متنی یا عکسی داری بفرست تا مستقیم بررسی و پاسخ داده بشه.\n\n` +
      `👥 *در گروه‌ها و سوپرگروه‌ها:*\n` +
      `۱. روی پیام ربات *ریپلای (Reply)* بزنید.\n` +
      `۲. ربات رو منشن کنید (مثلاً: \`@${CONFIG.BOT_USERNAME}\` یا کلمه *«ریدل»*).\n` +
      `۳. اول پیامتون بنویسید: \`/ask <متن سوال>\`\n\n` +
      `⚙️ *دستورات کاربردی:*\n` +
      `• \`/reset\` - پاک کردن تاریخچه چت فعلی\n` +
      `• \`/model\` - نمایش مشخصات مدل و وضعیت ویژن\n` +
      `• \`/ping\` - تست سرعت و پینگ ربات\n` +
      `• \`/sh <دستور>\` - اجرای شل لینوکس (مخصوص مالک)\n` +
      `• \`/cat <فایل>\` - مشاهده محتوای فایل در سرور\n` +
      `• \`/ls <مسیر>\` - لیست فایل‌ها در سرور`;
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

    if (isReplyToBot || isMentioned || isAskCmd || hasPhoto) {
      shouldReply = true;
      userQuery = text
        .replace(new RegExp(`@${CONFIG.BOT_USERNAME}`, 'gi'), '')
        .replace(/^\/ask\s*/i, '')
        .trim();
    }
  }

  if (!shouldReply) return;

  // Show typing or uploading photo action
  callTelegram('sendChatAction', {
    chat_id: chatId,
    action: hasPhoto ? 'upload_photo' : 'typing'
  }).catch(() => {});

  let imageBuffer = null;
  if (hasPhoto) {
    try {
      const bestPhoto = msg.photo[msg.photo.length - 1];
      const fileInfo = await callTelegram('getFile', { file_id: bestPhoto.file_id });
      if (fileInfo && fileInfo.ok && fileInfo.result.file_path) {
        imageBuffer = await downloadTelegramFile(fileInfo.result.file_path);
      }
    } catch (err) {
      console.error('Error downloading photo:', err);
    }
  }

  // Call AI (multimodal if imageBuffer present)
  let aiAnswer = await callAI(chatId, userQuery, imageBuffer);

  // If owner and AI suggested a bash command, execute it autonomously
  if (isOwner(fromId) && aiAnswer.includes('```bash')) {
    const bashMatch = aiAnswer.match(/```bash\s*([\s\S]*?)\s*```/);
    if (bashMatch && bashMatch[1]) {
      const autoCmd = bashMatch[1].trim();
      const execResult = await runTerminal(autoCmd);
      aiAnswer += `\n\n💻 *خروجی اجرای خودکار در ترمینال:*\n\`\`\`\n${execResult.slice(0, 3000)}\n\`\`\``;
    }
  }

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
      text: `مدل هوش مصنوعی: ${CONFIG.AI_MODEL} (Google Gemini 3.8 Flash + Vision)`,
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
  console.log('🐍 Riddle AI Bot v4.1 is starting...');
  console.log(`🤖 AI Model: ${CONFIG.AI_MODEL}`);
  console.log(`🌐 AI Endpoint: ${CONFIG.AI_API_BASE}`);
  console.log(`👁 Vision / Image Analysis: Enabled`);
  console.log(`💻 Terminal & Code Execution: Enabled (Owner: ${CONFIG.OWNER_IDS.join(', ')})`);

  try {
    const me = await callTelegram('getMe');
    if (!me.ok) {
      console.error('❌ Failed to connect to Telegram:', me);
      process.exit(1);
    }
    console.log(`✅ Connected to Telegram! Bot: @${me.result.username} (${me.result.first_name})`);

    await callTelegram('deleteWebhook', { drop_pending_updates: true });

    console.log('🚀 Long-polling started! Ready for messages...');
    pollUpdates();
  } catch (e) {
    console.error('Boot error:', e);
  }
}

main();