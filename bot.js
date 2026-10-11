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
  MAX_HISTORY: 10,
  ENABLE_PROXY: process.env.ENABLE_PROXY !== 'false',
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
// TELEGRAM HTTP CLIENT (PROXY + DIRECT FALLBACK)
// ==========================================
function callTelegram(method, payload = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    
    const makeDirectRequest = () => {
      const req = https.request({
        host: 'api.telegram.org',
        path: `/bot${CONFIG.TELEGRAM_TOKEN}/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 35000
      }, (apiRes) => {
        let body = '';
        apiRes.on('data', chunk => body += chunk);
        apiRes.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { resolve({ ok: false, error: body }); }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    };

    if (!CONFIG.ENABLE_PROXY) {
      return makeDirectRequest();
    }

    const connectReq = http.request({
      host: CONFIG.PROXY_HOST,
      port: CONFIG.PROXY_PORT,
      method: 'CONNECT',
      path: 'api.telegram.org:443',
      timeout: 5000
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        return makeDirectRequest();
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
        },
        timeout: 35000
      }, (apiRes) => {
        let body = '';
        apiRes.on('data', chunk => body += chunk);
        apiRes.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { resolve({ ok: false, error: body }); }
        });
      });

      req.on('error', () => makeDirectRequest());
      req.write(postData);
      req.end();
    });

    connectReq.on('error', () => makeDirectRequest());
    connectReq.on('timeout', () => {
      connectReq.destroy();
      makeDirectRequest();
    });
    connectReq.end();
  });
}

// Download Telegram file buffer via proxy with direct fallback
function downloadTelegramFile(filePath) {
  return new Promise((resolve, reject) => {
    const makeDirectDownload = () => {
      https.get(`https://api.telegram.org/file/bot${CONFIG.TELEGRAM_TOKEN}/${filePath}`, { timeout: 25000 }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };

    if (!CONFIG.ENABLE_PROXY) {
      return makeDirectDownload();
    }

    const connectReq = http.request({
      host: CONFIG.PROXY_HOST,
      port: CONFIG.PROXY_PORT,
      method: 'CONNECT',
      path: 'api.telegram.org:443',
      timeout: 5000
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        return makeDirectDownload();
      }

      const agent = new https.Agent({ socket });
      const req = https.request({
        host: 'api.telegram.org',
        path: `/file/bot${CONFIG.TELEGRAM_TOKEN}/${filePath}`,
        method: 'GET',
        agent: agent,
        timeout: 25000
      }, (apiRes) => {
        const chunks = [];
        apiRes.on('data', chunk => chunks.push(chunk));
        apiRes.on('end', () => resolve(Buffer.concat(chunks)));
      });

      req.on('error', () => makeDirectDownload());
      req.end();
    });

    connectReq.on('error', () => makeDirectDownload());
    connectReq.on('timeout', () => {
      connectReq.destroy();
      makeDirectDownload();
    });
    connectReq.end();
  });
}

// ==========================================
// TERMINAL RUNNER (FOR OWNER)
// ==========================================
function runTerminal(cmd, customCwd = '/root') {
  return new Promise((resolve) => {
    exec(cmd, { cwd: customCwd, timeout: 60000, maxBuffer: 1024 * 1024 * 3 }, (error, stdout, stderr) => {
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
// WEB SEARCH ENGINE (DUCKDUCKGO HTML + API)
// ==========================================
async function searchWeb(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const html = await new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fa,en-US;q=0.9,en;q=0.8'
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Search timeout')); });
    });

    const results = [];
    const snippetMatches = [...html.matchAll(/<a class="result__snippet[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const titleMatches = [...html.matchAll(/<a class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)];

    for (let i = 0; i < Math.min(titleMatches.length, 5); i++) {
      const title = titleMatches[i][2].replace(/<[^>]+>/g, '').trim();
      const rawLink = titleMatches[i][1];
      let actualUrl = rawLink;
      const uddgMatch = rawLink.match(/uddg=([^&]+)/);
      if (uddgMatch) actualUrl = decodeURIComponent(uddgMatch[1]);
      const snippet = snippetMatches[i] ? snippetMatches[i][2].replace(/<[^>]+>/g, '').trim() : '';
      if (title) results.push({ title, url: actualUrl, snippet });
    }

    if (results.length > 0) return results;

    const apiRes = await new Promise((resolve) => {
      https.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`, { timeout: 8000 }, (res) => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch(e) { resolve(null); }
        });
      }).on('error', () => resolve(null));
    });

    if (apiRes && (apiRes.AbstractText || apiRes.Heading)) {
      return [{ title: apiRes.Heading || query, url: apiRes.AbstractURL || '', snippet: apiRes.AbstractText || 'اطلاعات از دایره‌المعارف وب' }];
    }
    return [];
  } catch (err) {
    console.error('Web search error:', err.message);
    return [];
  }
}

// ==========================================
// AUTONOMOUS GITHUB REPO ANALYZER & INSTALLER
// ==========================================
async function handleGitHubRepo(chatId, repoUrl, fromId, messageId, forceInstall = false) {
  const match = repoUrl.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (!match) return false;

  const owner = match[1];
  let repo = match[2].replace(/\.git$/, '');
  const cleanUrl = `https://github.com/${owner}/${repo}.git`;
  const baseDir = '/root/installed_projects';
  const targetDir = `${baseDir}/${repo}`;

  await callTelegram('sendMessage', {
    chat_id: chatId,
    text: `🔍 *در حال بررسی مخزن گیت‌هاب:*\n\`${owner}/${repo}\`\n\n⏳ در حال کلون و دریافت کدهای پروژه از گیت‌هاب...`,
    parse_mode: 'Markdown',
    reply_to_message_id: messageId
  });

  try {
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

    let cloneLog = '';
    if (fs.existsSync(targetDir)) {
      cloneLog = await runTerminal(`git pull`, targetDir);
    } else {
      cloneLog = await runTerminal(`git clone --depth 1 "${cleanUrl}" "${targetDir}"`, baseDir);
    }

    let fileList = [];
    try { fileList = fs.readdirSync(targetDir); } catch(e) {}

    let readmeContent = '';
    const readmeFile = fileList.find(f => f.toLowerCase().startsWith('readme'));
    if (readmeFile) {
      try { readmeContent = fs.readFileSync(path.join(targetDir, readmeFile), 'utf8').slice(0, 3500); } catch(e) {}
    }

    let stackType = 'نامشخص / عمومی';
    let installCmd = '';
    let startCmd = '';

    if (fileList.includes('package.json')) {
      stackType = 'Node.js (JavaScript / TypeScript)';
      installCmd = 'npm install';
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
        if (pkg.scripts && pkg.scripts.start) startCmd = 'npm start';
        else if (pkg.scripts && pkg.scripts.dev) startCmd = 'npm run dev';
      } catch(e) {}
    } else if (fileList.includes('requirements.txt') || fileList.includes('pyproject.toml') || fileList.includes('setup.py')) {
      stackType = 'Python';
      installCmd = 'python3 -m venv .venv && .venv/bin/pip install -r requirements.txt';
      startCmd = 'python3 main.py';
    } else if (fileList.includes('Cargo.toml')) {
      stackType = 'Rust';
      installCmd = 'cargo build --release';
      startCmd = 'cargo run';
    } else if (fileList.includes('go.mod')) {
      stackType = 'Go (Golang)';
      installCmd = 'go mod download && go build';
      startCmd = `./${repo}`;
    }

    const aiPrompt = `شما مهندس ارشد نرم‌افزار هستید. یک مخزن گیت‌هاب به شرح زیر کلون شده است:
نام مخزن: ${owner}/${repo}
پشته فنی: ${stackType}
فایل‌های کلیدی پروژه: ${fileList.slice(0, 25).join(', ')}

بخشی از توضیحات README:
${readmeContent || 'توضیحات README در دسترس نیست.'}

لطفاً به زبان فارسی خودمانی و بسیار شیوا توضیح بده:
۱. این پروژه دقیقاً چیه و چه کارایی داره؟
۲. مهم‌ترین ویژگی‌هاش چیه؟
۳. روش نصب، کانفیگ و ران کردنش چطوره؟`;

    const aiAnalysis = await callAI(chatId, aiPrompt);

    const quoteLines = aiAnalysis.split('\n').filter(l => l.trim().length > 0);
    let quoteBlock = '';
    if (quoteLines.length > 0) {
      quoteBlock = `**> 📋 جزئیات و آموزش پروژه:\n` + quoteLines.map((l, idx) => `> ${l}${idx === quoteLines.length - 1 ? '||' : ''}`).join('\n');
    }

    let finalReport = `📦 *پروژه گیت‌هاب با موفقیت تحلیل شد:* \`${owner}/${repo}\`\n\n` +
                      `🛠 **پشته نرم‌افزاری:** \`${stackType}\`\n` +
                      `📁 **مسیر سورس روی سیستم:** \`${targetDir}\`\n\n` +
                      `${quoteBlock}\n\n`;

    if (forceInstall && isOwner(fromId)) {
      finalReport += `🚀 *در حال شروع نصب خودکار وابستگی‌ها در پس‌زمینه...*`;
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: finalReport,
        parse_mode: 'Markdown'
      });

      let installResult = 'دستور نصب اتوماتیک برای این پشته تعریف نشده است.';
      if (installCmd) {
        installResult = await runTerminal(installCmd, targetDir);
      }

      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: `✅ *عملیات نصب پکیج‌ها به پایان رسید:*\n\`${owner}/${repo}\`\n\n\`\`\`\n${installResult.slice(0, 3000)}\n\`\`\`\n\n💡 برای ران کردن پروژه:\n\`cd "${targetDir}" && ${startCmd || 'npm start'}\``,
        parse_mode: 'Markdown'
      });
      return true;
    } else {
      if (installCmd && isOwner(fromId)) {
        finalReport += `💡 *فرمان نصب خودکار برای مالک:* برای نصب و بیلد کامل این پروژه، همین حالا دستور زیر را ارسال کنید:\n\`/install ${cleanUrl}\``;
      }
      await callTelegram('sendMessage', {
        chat_id: chatId,
        text: finalReport,
        parse_mode: 'Markdown'
      });
      return true;
    }
  } catch (err) {
    console.error('GitHub handler error:', err);
    await callTelegram('sendMessage', {
      chat_id: chatId,
      text: `❌ خطا در پردازش مخزن گیت‌هاب: ${err.message}`,
      reply_to_message_id: messageId
    });
    return true;
  }
}

// ==========================================
// CALL LOCAL AI (9ROUTER GEMINI 3.8 FLASH)
// ==========================================
function callAI(chatId, userPrompt, imageBuffer = null, webSearchResults = null) {
  return new Promise((resolve, reject) => {
    let history = chatHistories.get(chatId) || [];
    
    let finalPrompt = userPrompt;
    if (webSearchResults && webSearchResults.length > 0) {
      const searchCtx = webSearchResults.map((r, i) => `[${i+1}] ${r.title}\nلینک: ${r.url}\nخلاصه: ${r.snippet}`).join('\n\n');
      finalPrompt = `[اطلاعات زنده وب برای سوال کاربر]:\n${searchCtx}\n\n[پیام کاربر]:\n${userPrompt}\n\nبر اساس این نتایج زنده وب، پاسخ روان، مستند و کاملی بنویس.`;
    }

    let userMsgContent;
    if (imageBuffer) {
      const b64 = imageBuffer.toString('base64');
      userMsgContent = [
        {
          type: 'text',
          text: finalPrompt || 'این تصویر را با دقت بررسی و تحلیل کن و تمام جزئیات یا متون آن را به زبان فارسی توضیح بده.'
        },
        {
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${b64}` }
        }
      ];
    } else {
      userMsgContent = finalPrompt;
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

  // ================= GITHUB HANDLER (/install OR /git OR RAW LINK) =================
  if (text.startsWith('/install ')) {
    if (!isOwner(fromId)) {
      return callTelegram('sendMessage', {
        chat_id: chatId,
        text: '⛔️ دستور نصب پروژه فقط مخصوص مالک است.',
        reply_to_message_id: messageId
      });
    }
    const repoUrl = text.replace('/install ', '').trim();
    return handleGitHubRepo(chatId, repoUrl, fromId, messageId, true);
  }

  if (text.startsWith('/git ') || /https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(text)) {
    const gitMatch = text.match(/https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/);
    if (gitMatch) {
      const isInstallRequested = text.includes('نصب') || text.includes('install') || text.startsWith('/install');
      return handleGitHubRepo(chatId, gitMatch[0], fromId, messageId, isInstallRequested && isOwner(fromId));
    }
  }

  // ================= WEB SEARCH COMMAND (/search OR /web) =================
  let webSearchData = null;
  const isSearchCmd = text.startsWith('/search ') || text.startsWith('/web ');
  const needsWebSearch = isSearchCmd || (text.length > 15 && (text.includes('اخبار') || text.includes('آخرین نسخه') || text.includes('قیمت امروز') || text.includes('سرچ کن') || text.includes('جستجو کن')));

  if (needsWebSearch) {
    callTelegram('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
    const query = isSearchCmd ? text.replace(/^(\/search|\/web)\s+/i, '').trim() : text;
    webSearchData = await searchWeb(query);
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
      `من *ریدل (Riddle)* هستم؛ دستیار هوش مصنوعی همه‌چیزدان، مجهز به بینایی ماشین (Vision)، جستجوی زنده وب، آنالیز و نصب خودکار گیت‌هاب و مغز قدرتمند *Google Gemini 3.8 Flash*! 🧠⚡️\n\n` +
      `🔥 *کارهایی که برات انجام میدم:*\n` +
      `• 📦 *تحلیل و نصب گیت‌هاب:* لینک هر پروژه‌ای رو بفرستی، کلونش می‌کنم، معمارش رو برات توضیح میدم و با \`/install <لینک>\` وابستگی‌هاشو برات نصب می‌کنم!\n` +
      `• 🌐 *جستجوی زنده وب:* اخبار روز، قیمت‌ها یا هر چیزی رو با \`/search <متن>\` از وب می‌کشم بیرون\n` +
      `• 🖼 *دیدن و تحلیل عکس‌ها:* هر عکسی رو بفرستی مو‌به‌مو می‌خونم و تحلیل می‌کنم\n` +
      `• 💻 *برنامه‌نویسی و ترمینال:* نوشتن کد و اجرای مستقیم لینوکس با \`/sh <دستور>\`\n\n` +
      `👇 *نحوه استفاده:*\n` +
      `• توی پیوی هر سوال یا لینکی داری بفرست تا مستقیم بررسی بشه!\n` +
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

  // Call AI (multimodal if imageBuffer present, with web search if available)
  let aiAnswer = await callAI(chatId, userQuery, imageBuffer, webSearchData);

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