const http = require('http');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('./telegram');
const db = require('./db');

// Environment Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error('CRITICAL ERROR: TELEGRAM_TOKEN environment variable is not defined.');
  process.exit(1);
}

const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL || '@rad_protocol';
const CHANNEL_LINK = process.env.CHANNEL_LINK || 'https://t.me/rad_protocol';
const SUPPORT_GROUP = process.env.SUPPORT_GROUP || 'https://t.me/radprotocoll';
const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'rad_hunter_secret_2026';

// Hardcoded Owner IDs + environment override
const DEFAULT_ADMINS = ['8602316735', '8678906046', '7746536015'];
const ENV_ADMINS = (process.env.ADMIN_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const ADMIN_IDS = Array.from(new Set([...DEFAULT_ADMINS, ...ENV_ADMINS]));

const bot = new TelegramBot(TELEGRAM_TOKEN);

// Initialize Database
db.initDb();

// Helper: Check if user is admin
function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

// Helper: Check Channel Membership
async function isChannelMember(userId) {
  if (isAdmin(userId)) return true; // Admins bypass join check
  try {
    const res = await bot.getChatMember(REQUIRED_CHANNEL, userId);
    if (!res || !res.ok) {
      console.warn(`Could not verify membership for ${userId} in ${REQUIRED_CHANNEL}:`, res && res.description);
      return false;
    }
    const status = res.result.status;
    return ['creator', 'administrator', 'member', 'restricted'].includes(status);
  } catch (err) {
    console.error('Error in isChannelMember:', err.message);
    return false;
  }
}

// UI: Force-Join Message
function getJoinMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '📢 عضویت در کانال RadProtocol', url: CHANNEL_LINK }
      ],
      [
        { text: '✅ تایید عضویت', callback_data: 'verify_join' }
      ],
      [
        { text: '👥 گروه پشتیبانی و گفتگو', url: SUPPORT_GROUP }
      ]
    ]
  };
}

function getJoinMessage(name) {
  return (
    `سلام <b>${name || 'کاربر گرامی'}</b> عزیز! 🌹\n\n` +
    `🔒 <b>برای استفاده از امکانات ربات شکارچی آفرها و لایسنس‌های رایگان، ابتدا باید در کانال رسمی ما عضو شوید:</b>\n\n` +
    `📢 <b>کانال:</b> ${REQUIRED_CHANNEL}\n\n` +
    `👇 پس از عضویت در کانال، روی دکمه‌ی <b>«تایید عضویت ✅»</b> کلیک کنید:`
  );
}

// UI: Main Menu
function getMainMenuMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '🔥 تازه‌ترین آفرهای داغ', callback_data: 'view_latest_0' },
        { text: '🗂 دسته‌بندی موضوعی', callback_data: 'menu_categories' }
      ],
      [
        { text: '🔔 تنظیم زنگ هشدار آفرها', callback_data: 'menu_alerts' },
        { text: '🔍 راهنمای جستجو', callback_data: 'menu_search_help' }
      ],
      [
        { text: '🎲 آفر شانس امروز', callback_data: 'deal_random' },
        { text: '📊 آمار و وضعیت شکارچی', callback_data: 'menu_stats' }
      ],
      [
        { text: '📢 کانال رسمی', url: CHANNEL_LINK },
        { text: '👥 گروه پشتیبانی', url: SUPPORT_GROUP }
      ]
    ]
  };
}

function getStartMessage(name) {
  return (
    `سلام <b>${name || 'دوست من'}</b> عزیز! 🎯\n` +
    `به <b>شکارچی آفرها و لایسنس‌های رایگان راد پروتکل</b> خوش اومدی! ⚡️\n\n` +
    `اینجا قرار نیست هیچ فرصت طلایی، لایسنس ویندوز و نرم‌افزار، اکانت پریمیوم، کوپن ۱۰۰٪ رایگان یودمی یا کانفیگ پرسرعتی رو از دست بدی!\n\n` +
    `💡 <b>امکانات ویژه شما:</b>\n` +
    `• 🎁 <b>آفرهای داغ و تست‌شده:</b> دسترسی رایگان و بدون سانسور به باارزش‌ترین فرصت‌های وب\n` +
    `• 🔔 <b>زنگ هشدار اختصاصی:</b> دسته‌های مورد علاقه‌ت رو انتخاب کن تا به محض ثبت آفر جدید، اختصاصی تو پیوی بهت خبر بدم!\n` +
    `• 🔍 <b>جستجوی هوشمند:</b> اسم هر برنامه یا مهارتی (مثل <code>canva</code>، <code>vpn</code>، <code>ویندوز</code>، <code>python</code>) رو بفرستی فورا برات می‌گردم\n` +
    `• 🗂 <b>تفکیک موضوعی:</b> دسترسی سریع و مرتب به دوره‌ها، اکانت‌های هوش مصنوعی و گرافیک\n\n` +
    `👇 از منوی زیر گزینه‌ی دلخواهت رو انتخاب کن:`
  );
}

// Format Deal View Card
function formatDealCard(deal) {
  const categories = db.getCategories();
  const cat = categories[deal.category] || { name: 'عمومی', emoji: '🎁' };

  let text = (
    `🏷 <b>دسته‌بندی:</b> ${cat.emoji} ${cat.name}\n` +
    `🔥 <b>وضعیت:</b> <i>${deal.badge || 'فعال'}</i>\n` +
    `📅 <b>تاریخ ثبت:</b> <code>${deal.date}</code>\n\n` +
    `📌 <b>${deal.title}</b>\n\n` +
    `📝 <b>توضیحات:</b>\n${deal.description}\n\n`
  );

  if (deal.code && deal.code !== 'AUTO_APPLIED') {
    text += `🔑 <b>کد کوپن / دستور فعال‌سازی:</b>\n<code>${deal.code}</code>\n\n`;
  }

  if (deal.instructions) {
    text += `📋 <b>راهنمای دریافت / فعال‌سازی:</b>\n${deal.instructions}\n\n`;
  }

  text += `⚡️ <i>ارائه‌شده توسط ${REQUIRED_CHANNEL}</i>`;

  const keyboard = [
    [
      { text: '🔗 ورود به صفحه / دریافت آفر', url: deal.link || CHANNEL_LINK }
    ],
    [
      { text: '📢 اشتراک با دوستان', url: `https://t.me/share/url?url=${encodeURIComponent(deal.link || CHANNEL_LINK)}&text=${encodeURIComponent(`🎁 آفر رایگان: ${deal.title}\nدر کانال @rad_protocol`)}` }
    ],
    [
      { text: '🔙 بازگشت به لیست آفرها', callback_data: `cat_${deal.category}_0` },
      { text: '🏠 منوی اصلی', callback_data: 'menu_main' }
    ]
  ];

  return { text, reply_markup: { inline_keyboard: keyboard } };
}

// Generate Category Selection Markup
function getCategoriesMarkup() {
  const categories = db.getCategories();
  const rows = [];
  const keys = Object.keys(categories);

  for (let i = 0; i < keys.length; i += 2) {
    const row = [];
    const cat1 = categories[keys[i]];
    const count1 = db.getDealsCount(keys[i]);
    row.push({ text: `${cat1.emoji} ${cat1.name} (${count1})`, callback_data: `cat_${keys[i]}_0` });

    if (keys[i + 1]) {
      const cat2 = categories[keys[i + 1]];
      const count2 = db.getDealsCount(keys[i + 1]);
      row.push({ text: `${cat2.emoji} ${cat2.name} (${count2})`, callback_data: `cat_${keys[i + 1]}_0` });
    }
    rows.push(row);
  }

  rows.push([
    { text: '🔥 نمایش همه آفرها', callback_data: 'view_latest_0' }
  ]);
  rows.push([
    { text: '🏠 بازگشت به منوی اصلی', callback_data: 'menu_main' }
  ]);

  return { inline_keyboard: rows };
}

// Generate Interactive Alerts Manager Markup
function getAlertsMarkup(userId) {
  const user = db.getUser(userId) || { alerts: {} };
  const userAlerts = user.alerts || {};
  const categories = db.getCategories();
  const rows = [];

  for (const [key, cat] of Object.entries(categories)) {
    const isEnabled = userAlerts[key] !== false; // Enabled by default
    const statusIcon = isEnabled ? '✅' : '⬜️';
    rows.push([
      {
        text: `${statusIcon} ${cat.emoji} ${cat.name}`,
        callback_data: `toggle_alert_${key}`
      }
    ]);
  }

  rows.push([
    { text: '🔔 فعال‌سازی همه', callback_data: 'alerts_all_on' },
    { text: '🔕 خاموش کردن همه', callback_data: 'alerts_all_off' }
  ]);
  rows.push([
    { text: '🏠 بازگشت به منوی اصلی', callback_data: 'menu_main' }
  ]);

  return { inline_keyboard: rows };
}

// Generate Deals List View with Pagination
function getDealsListMarkup(categoryKey, offset = 0, limit = 5) {
  const deals = db.getDeals(categoryKey, limit, offset);
  const total = db.getDealsCount(categoryKey);
  const categories = db.getCategories();
  const catTitle = categoryKey === 'all' || !categoryKey ? '🔥 تازه‌ترین آفرهای داغ' : `${categories[categoryKey]?.emoji || '🗂'} ${categories[categoryKey]?.name || 'دسته‌بندی'}`;

  let header = (
    `📦 <b>${catTitle}</b>\n` +
    `تعداد کل فرصت‌های این بخش: <b>${total}</b>\n\n` +
    `برای مشاهده جزئیات و لینک دریافت هر آفر، روی دکمه مربوطه کلیک کنید:\n`
  );

  const rows = [];
  if (deals.length === 0) {
    header += `\n<i>هنوز آفری در این دسته‌بندی ثبت نشده است! به زودی موارد جدید اضافه می‌شود.</i>\n`;
  } else {
    for (let i = 0; i < deals.length; i++) {
      const d = deals[i];
      const num = offset + i + 1;
      header += `\n${num}. <b>${d.title}</b> (${d.badge || 'آفر'})\n`;
      rows.push([
        { text: `👉 ${num}. مشاهده: ${d.title.slice(0, 32)}...`, callback_data: `deal_${d.id}` }
      ]);
    }
  }

  // Pagination navigation
  const navRow = [];
  if (offset > 0) {
    const prevOffset = Math.max(0, offset - limit);
    navRow.push({ text: '⬅️ صفحه قبل', callback_data: `page_${categoryKey || 'all'}_${prevOffset}` });
  }
  if (offset + limit < total) {
    const nextOffset = offset + limit;
    navRow.push({ text: 'صفحه بعد ➡️', callback_data: `page_${categoryKey || 'all'}_${nextOffset}` });
  }
  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([
    { text: '🗂 تغییر دسته‌بندی', callback_data: 'menu_categories' },
    { text: '🏠 منوی اصلی', callback_data: 'menu_main' }
  ]);

  return { text: header, reply_markup: { inline_keyboard: rows } };
}

// Broadcast new deal to subscribed users
async function notifySubscribersOfNewDeal(deal) {
  try {
    const subscribers = db.getAlertSubscribers(deal.category);
    if (!subscribers || subscribers.length === 0) return 0;

    const categories = db.getCategories();
    const cat = categories[deal.category] || { emoji: '🎁', name: 'آفر' };

    const alertText = (
      `🔔 <b>شکار جدید در دسته‌بندی ${cat.emoji} ${cat.name}!</b>\n\n` +
      `📌 <b>${deal.title}</b>\n` +
      `🔥 <b>وضعیت:</b> <i>${deal.badge || 'فرصت ویژه'}</i>\n\n` +
      `📝 ${deal.description.slice(0, 180)}...\n\n` +
      `👇 <i>برای مشاهده توضیحات کامل و دریافت رایگان، روی دکمه زیر کلیک کنید:</i>`
    );

    const markup = {
      inline_keyboard: [
        [
          { text: '🎁 مشاهده و دریافت این آفر', callback_data: `deal_${deal.id}` }
        ],
        [
          { text: '📢 کانال RadProtocol', url: CHANNEL_LINK }
        ]
      ]
    };

    let sent = 0;
    for (const uid of subscribers) {
      try {
        await bot.sendMessage(uid, alertText, { reply_markup: markup });
        sent++;
        await new Promise(r => setTimeout(r, 45)); // Rate limiting Telegram API
      } catch (e) {
        // User may have blocked or stopped bot
      }
    }

    db.recordAlertSent(sent);
    console.log(`Dispatched new deal alert to ${sent}/${subscribers.length} subscribers.`);
    return sent;
  } catch (err) {
    console.error('Error notifying subscribers:', err.message);
    return 0;
  }
}

// Handle Incoming Updates
async function handleUpdate(update) {
  try {
    // 1. Handle Callback Queries (Button Clicks)
    if (update.callback_query) {
      const cq = update.callback_query;
      const userId = cq.from.id;
      const data = cq.data;
      const chatId = cq.message ? cq.message.chat.id : userId;
      const messageId = cq.message ? cq.message.message_id : null;

      db.registerUser(cq.from);

      // Membership Verification Callback
      if (data === 'verify_join') {
        const joined = await isChannelMember(userId);
        if (joined) {
          await bot.answerCallbackQuery(cq.id, {
            text: 'عضویت شما با موفقیت تأیید شد! به خانواده RadProtocol خوش آمدید 🌹',
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

      // Check membership for any other callback query
      const isMember = await isChannelMember(userId);
      if (!isMember) {
        await bot.answerCallbackQuery(cq.id, {
          text: '🔒 برای استفاده از دکمه‌ها ابتدا باید در کانال عضو شوید.',
          show_alert: true
        });
        if (messageId) {
          await bot.editMessageText(chatId, messageId, getJoinMessage(cq.from.first_name), {
            reply_markup: getJoinMarkup()
          });
        }
        return;
      }

      // Main Menu Callback
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

      // Categories Menu
      if (data === 'menu_categories') {
        await bot.answerCallbackQuery(cq.id);
        const text = (
          `🗂 <b>دسته‌بندی موضوعی آفرهای شکارچی:</b>\n\n` +
          `لطفاً دسته‌بندی مورد نظر خود را انتخاب کنید تا لیست جدیدترین لایسنس‌ها، اکانت‌ها و دوره‌ها را ببینید:`
        );
        if (messageId) {
          await bot.editMessageText(chatId, messageId, text, {
            reply_markup: getCategoriesMarkup()
          });
        } else {
          await bot.sendMessage(chatId, text, { reply_markup: getCategoriesMarkup() });
        }
        return;
      }

      // Alerts Settings Menu
      if (data === 'menu_alerts') {
        await bot.answerCallbackQuery(cq.id);
        const text = (
          `🔔 <b>مرکز مدیریت زنگ هشدار آفرها:</b>\n\n` +
          `با کلیک روی هر گزینه، می‌توانید دریافت نوتیفیکیشن برای آن دسته‌بندی را فعال (✅) یا غیرفعال (⬜️) کنید.\n\n` +
          `به محض اینکه آفر، کوپن یا لایسنس جدیدی ثبت شود، ربات فوراً در پیوی شما ارسال خواهد کرد!`
        );
        if (messageId) {
          await bot.editMessageText(chatId, messageId, text, {
            reply_markup: getAlertsMarkup(userId)
          });
        } else {
          await bot.sendMessage(chatId, text, { reply_markup: getAlertsMarkup(userId) });
        }
        return;
      }

      // Toggle Individual Alert
      if (data.startsWith('toggle_alert_')) {
        const catKey = data.replace('toggle_alert_', '');
        const newState = db.toggleAlert(userId, catKey);
        const categories = db.getCategories();
        const catName = categories[catKey] ? categories[catKey].name : catKey;

        await bot.answerCallbackQuery(cq.id, {
          text: newState ? `هشدار برای «${catName}» فعال شد 🔔` : `هشدار برای «${catName}» خاموش شد 🔕`
        });

        if (messageId) {
          await bot.editMessageReplyMarkup(chatId, messageId, {
            reply_markup: getAlertsMarkup(userId)
          });
        }
        return;
      }

      // Turn All Alerts On/Off
      if (data === 'alerts_all_on' || data === 'alerts_all_off') {
        const turnOn = data === 'alerts_all_on';
        db.setAllAlerts(userId, turnOn);
        await bot.answerCallbackQuery(cq.id, {
          text: turnOn ? 'تمامی هشدارها فعال شدند! 🔔' : 'تمام هشدارها خاموش شدند 🔕'
        });
        if (messageId) {
          await bot.editMessageReplyMarkup(chatId, messageId, {
            reply_markup: getAlertsMarkup(userId)
          });
        }
        return;
      }

      // Search Help Menu
      if (data === 'menu_search_help') {
        await bot.answerCallbackQuery(cq.id);
        const helpText = (
          `🔍 <b>راهنمای جستجوی هوشمند در شکارچی:</b>\n\n` +
          `نیازی به زدن دستور خاصی نیست! هر کلمه‌ای را در همین صفحه بنویسید و بفرستید، ربات تمام آفرها، عنوان‌ها، توضیحات و تگ‌ها را جستجو می‌کند.\n\n` +
          `💡 <b>نمونه عبارت‌های قابل جستجو:</b>\n` +
          `• <code>canva</code> یا <code>کانوا</code>\n` +
          `• <code>vpn</code> یا <code>وایرگارد</code>\n` +
          `• <code>ویندوز</code> یا <code>windows</code>\n` +
          `• <code>udemy</code> یا <code>پایتون</code>\n` +
          `• <code>ai</code> یا <code>هوش مصنوعی</code>\n` +
          `• <code>آنتی ویروس</code>\n\n` +
          `همین حالا کلمه مورد نظرتان را تایپ کنید و بفرستید! 👇`
        );
        const backMarkup = {
          inline_keyboard: [
            [{ text: '🏠 بازگشت به منوی اصلی', callback_data: 'menu_main' }]
          ]
        };
        if (messageId) {
          await bot.editMessageText(chatId, messageId, helpText, { reply_markup: backMarkup });
        } else {
          await bot.sendMessage(chatId, helpText, { reply_markup: backMarkup });
        }
        return;
      }

      // Bot Statistics Menu
      if (data === 'menu_stats') {
        await bot.answerCallbackQuery(cq.id);
        const stats = db.getStats();
        const uptimeH = (process.uptime() / 3600).toFixed(1);
        const statsText = (
          `📊 <b>آمار و وضعیت سامانه شکارچی RadProtocol:</b>\n\n` +
          `👥 تعداد کل اعضای ربات: <b>${stats.totalUsers} نفر</b>\n` +
          `🎁 تعداد آفرهای ثبت‌شده: <b>${stats.totalDeals} آفر</b>\n` +
          `🔔 هشدارهای ارسال‌شده: <b>${stats.totalAlertsSent} پیام</b>\n` +
          `🔍 جستجوهای انجام‌شده: <b>${stats.totalSearches} بار</b>\n` +
          `⏱ آپ‌تایم سرور: <b>${uptimeH} ساعت</b>\n` +
          `🟢 وضعیت سرویس: <b>فعال و آنلاین (Render Cloud)</b>\n\n` +
          `📢 کانال رسمی: ${REQUIRED_CHANNEL}`
        );
        const backMarkup = {
          inline_keyboard: [
            [{ text: '🏠 بازگشت به منوی اصلی', callback_data: 'menu_main' }]
          ]
        };
        if (messageId) {
          await bot.editMessageText(chatId, messageId, statsText, { reply_markup: backMarkup });
        } else {
          await bot.sendMessage(chatId, statsText, { reply_markup: backMarkup });
        }
        return;
      }

      // View Latest Deals / Deals List Pagination
      if (data.startsWith('view_latest_') || data.startsWith('page_') || data.startsWith('cat_')) {
        await bot.answerCallbackQuery(cq.id);
        let categoryKey = 'all';
        let offset = 0;

        if (data.startsWith('view_latest_')) {
          offset = parseInt(data.replace('view_latest_', ''), 10) || 0;
          categoryKey = 'all';
        } else if (data.startsWith('page_')) {
          const parts = data.split('_');
          categoryKey = parts[1];
          offset = parseInt(parts[2], 10) || 0;
        } else if (data.startsWith('cat_')) {
          const parts = data.split('_');
          categoryKey = parts[1];
          offset = parseInt(parts[2], 10) || 0;
        }

        const view = getDealsListMarkup(categoryKey, offset, 5);
        if (messageId) {
          await bot.editMessageText(chatId, messageId, view.text, { reply_markup: view.reply_markup });
        } else {
          await bot.sendMessage(chatId, view.text, { reply_markup: view.reply_markup });
        }
        return;
      }

      // View Deal Details
      if (data.startsWith('deal_')) {
        const dealId = data.replace('deal_', '');
        const deal = dealId === 'random' ? db.getRandomDeal() : db.getDealById(dealId);

        if (!deal) {
          await bot.answerCallbackQuery(cq.id, {
            text: '⚠️ متأسفانه این آفر پیدا نشد یا منقضی شده است.',
            show_alert: true
          });
          return;
        }

        await bot.answerCallbackQuery(cq.id);
        const card = formatDealCard(deal);
        if (messageId) {
          await bot.editMessageText(chatId, messageId, card.text, card);
        } else {
          await bot.sendMessage(chatId, card.text, card);
        }
        return;
      }
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

      // Command: /start (supports deep linking: /start <payload>)
      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        const payload = parts.length > 1 ? parts[1].trim() : '';

        // Handle specific download payloads
        if (payload === 'openchat' || payload === 'openchat_vip') {
          // Send OpenChat APK directly from our storage/bot
          const caption = (
            `🤖 <b>دانلود مستقیم نسخه آنلاک OpenChat VIP v1.3.8</b>\n\n` +
            `🔹 فعال‌سازی نامحدود مدل‌های AI و GPT-4o\n` +
            `🔹 تولید تصویر نامحدود هوش مصنوعی\n` +
            `🔹 حذف تبلیغات و پشتیبانی زبان فارسی\n\n` +
            `📢 کانال رسمی: ${REQUIRED_CHANNEL}`
          );
          
          await bot.copyMessage(chatId, '@bpsdownload', 257, {
            caption: caption
          });
          return;
        }

        await bot.sendMessage(chatId, getStartMessage(msg.from.first_name), {
          reply_markup: getMainMenuMarkup()
        });
        return;
      }

      // Command: /help
      if (text === '/help') {
        const helpText = (
          `📖 <b>راهنمای ربات شکارچی آفرها:</b>\n\n` +
          `• برای دیدن دسته‌بندی‌ها: /categories\n` +
          `• برای آخرین آفرها: /latest\n` +
          `• برای تنظیم هشدار اختصاصی: /alerts\n` +
          `• برای دریافت یک آفر رندوم: /random\n` +
          `• برای جستجو: کافیست نام نرم‌افزار، لایسنس یا مهارت مورد نظر را تایپ کنید.\n\n` +
          `📢 کانال ما: ${REQUIRED_CHANNEL}`
        );
        await bot.sendMessage(chatId, helpText, { reply_markup: getMainMenuMarkup() });
        return;
      }

      // Command: /categories
      if (text === '/categories') {
        await bot.sendMessage(chatId, '🗂 لطفاً دسته‌بندی مورد نظرتان را انتخاب کنید:', {
          reply_markup: getCategoriesMarkup()
        });
        return;
      }

      // Command: /latest
      if (text === '/latest') {
        const view = getDealsListMarkup('all', 0, 5);
        await bot.sendMessage(chatId, view.text, { reply_markup: view.reply_markup });
        return;
      }

      // Command: /alerts
      if (text === '/alerts') {
        await bot.sendMessage(chatId, '🔔 تنظیمات زنگ هشدار آفرها:', {
          reply_markup: getAlertsMarkup(userId)
        });
        return;
      }

      // Command: /random
      if (text === '/random') {
        const deal = db.getRandomDeal();
        if (deal) {
          const card = formatDealCard(deal);
          await bot.sendMessage(chatId, card.text, card);
        } else {
          await bot.sendMessage(chatId, 'هنوز آفری در دیتابیس ثبت نشده است.');
        }
        return;
      }

      // Admin Command: /admin or /panel
      if ((text === '/admin' || text === '/panel') && isAdmin(userId)) {
        const stats = db.getStats();
        const uptimeH = (process.uptime() / 3600).toFixed(1);
        const adminText = (
          `👑 <b>پنل مدیریت شکارچی (RadProtocol Admin)</b>\n\n` +
          `👥 تعداد کاربران کل: <b>${stats.totalUsers} نفر</b>\n` +
          `🎁 تعداد کل آفرها: <b>${stats.totalDeals} عدد</b>\n` +
          `🔔 هشدارهای ارسال‌شده: <b>${stats.totalAlertsSent} بار</b>\n` +
          `🔍 جستجوهای کاربران: <b>${stats.totalSearches} بار</b>\n` +
          `⏱ آپ‌تایم سرویس: <b>${uptimeH} ساعت</b>\n\n` +
          `📊 <b>آمار اشتراک هشدارها:</b>\n` +
          `• یودمی: <b>${stats.alertSubscriptions.udemy || 0} نفر</b>\n` +
          `• وی‌پی‌ان: <b>${stats.alertSubscriptions.vpn || 0} نفر</b>\n` +
          `• هوش مصنوعی: <b>${stats.alertSubscriptions.ai || 0} نفر</b>\n` +
          `• گرافیک/کانوا: <b>${stats.alertSubscriptions.design || 0} نفر</b>\n` +
          `• لایسنس و نرم‌افزار: <b>${stats.alertSubscriptions.licenses || 0} نفر</b>\n` +
          `• گیفت و ترفند: <b>${stats.alertSubscriptions.freebies || 0} نفر</b>\n\n` +
          `🛠 <b>دستورات مدیریتی:</b>\n` +
          `• ارسال همگانی:\n<code>/broadcast متن پیام</code>\n` +
          `• افزودن آفر فوری:\n<code>/adddeal دسته | عنوان | لینک | توضیحات | کد (اختیاری)</code>\n` +
          `• حذف آفر:\n<code>/deldeal [شناسه]</code>`
        );
        await bot.sendMessage(chatId, adminText);
        return;
      }

      // Admin Command: /broadcast <text>
      if (text.startsWith('/broadcast') && isAdmin(userId)) {
        const broadcastText = text.replace('/broadcast', '').trim();
        if (!broadcastText) {
          await bot.sendMessage(chatId, 'لطفاً متن پیام همگانی را بعد از دستور وارد کنید:\n<code>/broadcast سلام دوستان...</code>');
          return;
        }

        const users = db.getAllUserIds();
        await bot.sendMessage(chatId, `⏳ ارسال پیام به ${users.length} کاربر آغاز شد...`);
        let successCount = 0;

        for (const uid of users) {
          try {
            await bot.sendMessage(uid, broadcastText);
            successCount++;
            await new Promise(r => setTimeout(r, 40));
          } catch (e) {
            // Ignored if user blocked
          }
        }
        await bot.sendMessage(chatId, `✅ پیام همگانی به ${successCount} نفر از ${users.length} کاربر با موفقیت ارسال شد.`);
        return;
      }

      // Admin Command: /adddeal <cat> | <title> | <link> | <desc> | <code>
      if (text.startsWith('/adddeal') && isAdmin(userId)) {
        const raw = text.replace('/adddeal', '').trim();
        const parts = raw.split('|').map(s => s.trim());

        if (parts.length < 4) {
          await bot.sendMessage(chatId, (
            `⚠️ فرمت دستور نادرست است.\nالگو:\n` +
            `<code>/adddeal دسته | عنوان | لینک | توضیحات | کد (اختیاری)</code>\n\n` +
            `دسته‌ها: <code>udemy</code>, <code>vpn</code>, <code>ai</code>, <code>design</code>, <code>licenses</code>, <code>freebies</code>`
          ));
          return;
        }

        const [cat, title, link, desc, code] = parts;
        const newDeal = db.addDeal({
          title,
          category: cat,
          link,
          description: desc,
          code: code || '',
          badge: '🔥 جدید',
          instructions: 'روی دکمه دریافت زیر کلیک کرده و مراحل را طبق راهنما طی کنید.'
        });

        await bot.sendMessage(chatId, `✅ آفر جدید با شناسه <code>${newDeal.id}</code> ثبت شد!\nدر حال ارسال هشدار به مشترکین...`);
        const alertedCount = await notifySubscribersOfNewDeal(newDeal);
        await bot.sendMessage(chatId, `📢 هشدار این آفر برای <b>${alertedCount}</b> کاربر مشترک ارسال گردید.`);
        return;
      }

      // Admin Command: /deldeal <id>
      if (text.startsWith('/deldeal') && isAdmin(userId)) {
        const dealId = text.replace('/deldeal', '').trim();
        const ok = db.deleteDeal(dealId);
        if (ok) {
          await bot.sendMessage(chatId, `🗑 آفر <code>${dealId}</code> با موفقیت حذف گردید.`);
        } else {
          await bot.sendMessage(chatId, `⚠️ آفری با شناسه <code>${dealId}</code> یافت نشد.`);
        }
        return;
      }

      // SMART SEARCH HANDLER (For any normal user text)
      db.recordSearch(userId);
      const results = db.searchDeals(text);

      if (results.length === 0) {
        const noResultText = (
          `🔍 نتیجه‌ای برای عبارت <b>«${text}»</b> پیدا نشد!\n\n` +
          `💡 <b>پیشنهاد:</b>\n` +
          `کلماتی مثل <code>canva</code>، <code>vpn</code>، <code>ویندوز</code>، <code>udemy</code> یا <code>ai</code> را جستجو کنید، یا از طریق منوی زیر تمام آفرهای فعال را مرور نمایید:`
        );
        await bot.sendMessage(chatId, noResultText, { reply_markup: getMainMenuMarkup() });
        return;
      }

      let searchMsg = `🎯 <b>نتایج جستجو برای: «${text}»</b>\nتعداد موارد یافت‌شده: <b>${results.length}</b>\n\n`;
      const searchRows = [];

      for (let i = 0; i < Math.min(results.length, 8); i++) {
        const d = results[i];
        searchMsg += `${i + 1}. <b>${d.title}</b>\n`;
        searchRows.push([
          { text: `👉 ${i + 1}. ${d.title.slice(0, 34)}...`, callback_data: `deal_${d.id}` }
        ]);
      }

      searchRows.push([
        { text: '🗂 مشاهده تمام دسته‌بندی‌ها', callback_data: 'menu_categories' },
        { text: '🏠 منوی اصلی', callback_data: 'menu_main' }
      ]);

      await bot.sendMessage(chatId, searchMsg, {
        reply_markup: { inline_keyboard: searchRows }
      });
    }
  } catch (err) {
    console.error('Global handleUpdate error:', err);
  }
}

// HTTP Server (Native Node.js - Zero External Dependencies)
const server = http.createServer(async (req, res) => {
  const parsedUrl = (req.url || '/').split('?')[0];

  // Health / Status Check Endpoint
  if (req.method === 'GET' && (parsedUrl === '/' || parsedUrl === '/health')) {
    const stats = db.getStats();
    let cfInfo = null;
    try {
      const { getDeployResult } = require('./deploy_cf');
      cfInfo = getDeployResult();
    } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'online',
      service: 'RadProtocol Deal & Freebie Hunter Bot',
      version: '3.0.0',
      totalUsers: stats.totalUsers,
      totalDeals: stats.totalDeals,
      uptime: `${Math.floor(process.uptime())}s`,
      cloudflareProxy: cfInfo
    }));
  }

  // Telegram Webhook Endpoint
  if (req.method === 'POST' && parsedUrl === '/webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      try {
        if (body && body.trim()) {
          const update = JSON.parse(body);
          handleUpdate(update);
        }
      } catch (err) {
        console.error('Invalid webhook JSON payload:', err.message);
      }
    });
    return;
  }

  // REST API Endpoint to Add Deals Externally & Broadcast Alert
  if (req.method === 'POST' && parsedUrl === '/api/deal') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (payload.secret !== API_SECRET) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Unauthorized secret' }));
        }

        if (!payload.title || !payload.category) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Missing title or category' }));
        }

        const newDeal = db.addDeal({
          title: payload.title,
          category: payload.category,
          link: payload.link || CHANNEL_LINK,
          description: payload.description || '',
          code: payload.code || '',
          badge: payload.badge || '🔥 جدید',
          instructions: payload.instructions || 'روی دکمه دریافت کلیک کنید.',
          tags: payload.tags || []
        });

        const alerted = await notifySubscribersOfNewDeal(newDeal);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: true, dealId: newDeal.id, subscribersAlerted: alerted }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Start Service
server.listen(PORT, async () => {
  console.log(`🚀 RadProtocol Deal Hunter Server listening on port ${PORT}`);

  const botInfo = await bot.getMe();
  if (botInfo && botInfo.ok) {
    console.log(`🤖 Logged in as @${botInfo.result.username} (${botInfo.result.first_name})`);
  } else {
    console.error('❌ Failed to login to Telegram with provided token!');
  }

  // Setup Webhook on Render
  const renderUrl = process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_URL;
  if (renderUrl) {
    const webhookUrl = `${renderUrl.replace(/\/$/, '')}/webhook`;
    console.log(`🔗 Setting Telegram Webhook to: ${webhookUrl}`);
    const whRes = await bot.setWebhook(webhookUrl);
    console.log('Webhook result:', whRes);

    // Self-Ping Keep-Alive to prevent Render free-tier sleep
    initKeepAlive(renderUrl);

    // Auto-deploy Cloudflare Telegram Proxy on start
    try {
      const { deployCloudflareWorker } = require('./deploy_cf');
      deployCloudflareWorker().catch(e => console.error('Background CF deploy error:', e.message));
    } catch (e) {}
  } else {
    console.log('⚡️ No Webhook URL detected; starting long polling mode...');
    startPolling();
  }
});

// Self-Ping Keep-Alive (Pings every 10 minutes)
function initKeepAlive(url) {
  const targetUrl = url.replace(/\/$/, '') + '/health';
  const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  console.log(`⏱ Keep-Alive system active: Pinging ${targetUrl} every 10 minutes`);
  setInterval(async () => {
    try {
      const res = await fetch(targetUrl);
      console.log(`[Keep-Alive] Ping to ${targetUrl} successful (Status: ${res.status})`);
    } catch (err) {
      console.warn(`[Keep-Alive] Ping failed: ${err.message}`);
    }
  }, INTERVAL_MS);
}

// Fallback Long Polling (for local dev / non-webhook environments)
async function startPolling() {
  await bot.deleteWebhook();
  let offset = 0;
  while (true) {
    try {
      const updates = await bot.getUpdates(offset, 25);
      if (updates && updates.ok && Array.isArray(updates.result)) {
        for (const update of updates.result) {
          offset = update.update_id + 1;
          handleUpdate(update);
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}
