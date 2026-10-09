/**
 * Cloudflare Worker for Riddle AI Telegram Bot
 * Features:
 * - Direct Telegram Webhook Handler
 * - Google Gemini 3.8 Flash AI Engine
 * - Group & DM Chat Intelligence (Kharabkar style)
 * - Code formatting & Persian natural persona
 */

const CONFIG = {
  TELEGRAM_TOKEN: "YOUR_TELEGRAM_BOT_TOKEN",
  AI_API_BASE: "http://127.0.0.1:20128/v1",
  AI_API_KEY: "YOUR_AI_API_KEY",
  AI_MODEL: "ag/gemini-3.8-flash-low",
  BOT_USERNAME: "Gifty_buyapp_bot",
  SYSTEM_PROMPT: `تو «🐍 ریدل (Riddle)» هستی؛ یک دستیار هوش مصنوعی نابغه، کاریزماتیک، به شدت باهوش و در عین حال شوخ‌طبع و رفیق (دقیقاً مثل خرابکار).
۱. زبان: کاملاً فارسی محاوره‌ای، روان، گرم و باحال.
۲. تخصص‌ها: مسلط به برنامه‌نویسی، طراحی وب، امنیت، سیستم‌عامل، بازی‌ها و علوم پایه.
۳. در کدنویسی: کدهای تمیز، بهینه و با توضیح مختصر.
۴. شوخ‌طبعی: حاضرجواب، تیز و پرانرژی.`
};

async function callTelegram(method, payload = {}) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

async function callAI(userPrompt) {
  try {
    const res = await fetch(CONFIG.AI_API_BASE + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.AI_API_KEY}`
      },
      body: JSON.stringify({
        model: CONFIG.AI_MODEL,
        messages: [
          { role: "system", content: CONFIG.SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        stream: false
      })
    });
    if (!res.ok) {
      return `❌ خطا در ارتباط با هوش مصنوعی (کد: ${res.status})`;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "پاسخی از مدل دریافت نشد.";
  } catch (err) {
    return `❌ خطا در پردازش هوش مصنوعی: ${err.message}`;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response(JSON.stringify({
        status: "alive",
        bot: "🐍 Riddle AI Bot (@" + CONFIG.BOT_USERNAME + ")",
        model: CONFIG.AI_MODEL,
        time: new Date().toISOString()
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        const update = await request.json();
        const msg = update.message;
        if (msg && msg.text) {
          const chatId = msg.chat.id;
          const text = msg.text.trim();
          const fromUser = msg.from?.first_name || "رفیق";

          if (text === "/start") {
            await callTelegram("sendMessage", {
              chat_id: chatId,
              text: `سلام <b>${fromUser}</b> عزیز! 🐍✨\n\nمن <b>ریدل (Riddle)</b> هستم؛ دستیار هوش مصنوعی همه‌چیزدان و شوخ‌طبع مجهز به مغز قدرتمند <b>Google Gemini 3.8 Flash</b>! 🧠⚡️\n\nهر سوالی داری همینجا بپرس تا جوابت رو بدم!`,
              parse_mode: "HTML",
              reply_markup: {
                inline_keyboard: [
                  [{ text: "📢 کانال RadProtocol", url: "https://t.me/rad_protocol" }],
                  [{ text: "🎬 وب‌اپلیکیشن دابل پلیر", url: "https://arianf3.github.io/dumble-player/" }]
                ]
              }
            });
            return new Response("OK");
          }

          if (text === "/model") {
            await callTelegram("sendMessage", {
              chat_id: chatId,
              text: `🧠 <b>مدل فعال:</b> <code>${CONFIG.AI_MODEL}</code>\n⚡️ <b>هسته:</b> Google Gemini 3.8 Flash\n🟢 <b>وضعیت:</b> آنلاین روی سرورهای ابری Cloudflare Workers`,
              parse_mode: "HTML"
            });
            return new Response("OK");
          }

          // Show typing
          ctx.waitUntil(callTelegram("sendChatAction", { chat_id: chatId, action: "typing" }));

          // Call AI
          const answer = await callAI(text);
          await callTelegram("sendMessage", {
            chat_id: chatId,
            text: answer,
            parse_mode: "Markdown"
          });
        }
      } catch (e) {
        console.error("Webhook err:", e);
      }
      return new Response("OK");
    }

    return new Response("Not Found", { status: 404 });
  }
};
