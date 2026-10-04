const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'database.json');

const CATEGORIES = {
  udemy: {
    id: 'udemy',
    name: 'دوره‌های یودمی (100% OFF)',
    emoji: '🎓',
    desc: 'کوپن‌های ۱۰۰٪ رایگان دوره‌های آموزشی Udemy با مدرک'
  },
  vpn: {
    id: 'vpn',
    name: 'ابزارها و کانفیگ‌های VPN',
    emoji: '🛡',
    desc: 'کانفیگ‌ها، اکانت‌ها و روش‌های اتصال پرسرعت رایگان'
  },
  ai: {
    id: 'ai',
    name: 'هوش مصنوعی و اکانت‌ها',
    emoji: '🤖',
    desc: 'اشتراک‌ها، سهمیه‌ها و دسترسی رایگان به ابزارهای AI'
  },
  design: {
    id: 'design',
    name: 'گرافیک و دیزاین (Canva...)',
    emoji: '🎨',
    desc: 'اکانت‌های پرو کانوا، قالب‌ها و فایل‌های پرمیوم گرافیکی'
  },
  licenses: {
    id: 'licenses',
    name: 'لایسنس ویندوز و نرم‌افزار',
    emoji: '🔑',
    desc: 'فعال‌سازی دیجیتال و قانونی ویندوز، آفیس و آنتی‌ویروس‌ها'
  },
  freebies: {
    id: 'freebies',
    name: 'ترفندها و گیفت‌های پرمیوم',
    emoji: '⚡️',
    desc: 'پک‌های دانشجویی، هاست و سرور رایگان، دامنه‌ها و تخفیف‌ها'
  }
};

const DEFAULT_DEALS = [
  {
    id: 'deal_fullstack_web_mean',
    title: 'دوره جامع توسعه وب فول‌استک (استک MEAN در گوگل درایو)',
    category: 'freebies',
    badge: '🎓 فولدر کامل گوگل درایو',
    description: 'پکیج آموزشی جامع فرانت‌اند و بک‌اند شامل HTML5, CSS3, JS, SASS, TypeScript, MongoDB, Node.js و Angular با سورس کامل در Google Drive.',
    instructions: 'وارد لینک گوگل درایو زیر شوید و به تمام ویدیوها، سورس‌ها و فایل‌های تمرینی به صورت رایگان دسترسی پیدا کنید.',
    code: '',
    link: 'https://drive.google.com/drive/folders/1Pcv3XH7XL4TEbMEJqOQLNBK-INsgR5In',
    date: '2026-09-22',
    tags: ['web', 'وب', 'فرانت', 'بک', 'javascript', 'جاوااسکریپت', 'node', 'nodejs', 'mongodb', 'angular', 'html', 'css', 'برنامه‌نویسی', 'کامل']
  },
  {
    id: 'deal_genspark_ai_unlimited',
    title: 'اکانت نامحدود و رایگان Genspark AI (موتور ریسرچ با Claude 3.5 و GPT-4o)',
    category: 'ai',
    badge: '🤖 ترفند فعال‌سازی نامحدود',
    description: 'موتور هوش مصنوعی تحقیقاتی و رقیب قدرتمند Perplexity با پشتیبانی از Claude 3.5 Sonnet و GPT-4o بدون نیاز به شماره یا کردیت کارت.',
    instructions: '۱. با یک سرویس ایمیل موقت نظیر Smailpro.com ایمیل بسازید.\n۲. در سایت Genspark.ai ثبت‌نام کنید.\n۳. کد دریافتی را وارد نمایید و از ظرفیت کامل تحقیقاتی هوش مصنوعی لذت ببرید!',
    code: '',
    link: 'https://www.genspark.ai/',
    date: '2026-09-22',
    tags: ['genspark', 'جن‌اسپارک', 'ai', 'هوش مصنوعی', 'perplexity', 'پرپلکسیتی', 'claude', 'gpt', 'تحقیق', 'رایگان']
  },
  {
    id: 'deal_udemy_ai_python',
    title: 'دوره جامع هوش مصنوعی، پایتون و یادگیری ماشین (Udemy)',
    category: 'udemy',
    badge: '🎁 کوپن ۱۰۰٪ رایگان',
    description: 'دوره کامل Learn AI, Python, Machine Learning & Data Science در پلتفرم یودمی با کوپن مستقیم و دائمی همراه با مدرک پایان دوره.',
    instructions: 'روی لینک زیر کلیک کنید و دکمه Enroll Now را بزنید تا با کوپن اعمال شده به ارزش کامل رایگان به اکانت شما اضافه شود.',
    code: 'E43B3D626CB574340155',
    link: 'https://www.udemy.com/course/learn-ai-python-machine-learning-data-science-big-data/?couponCode=E43B3D626CB574340155',
    date: '2026-09-21',
    tags: ['udemy', 'یودمی', 'پایتون', 'python', 'ai', 'هوش مصنوعی', 'machine learning', 'یادگیری ماشین', 'data science', 'علم داده', 'کوپن', 'رایگان']
  },
  {
    id: 'deal_canva_pro',
    title: 'اشتراک نامحدود Canva Pro و Education (لینک فعال‌سازی تیم رسمی)',
    category: 'design',
    badge: '🔥 ویژه و تضمینی',
    description: 'دسترسی رایگان و قانونی به تمام امکانات Canva Pro بدون نیاز به مسترکارت و ویزاکارت از طریق اینوایت تیم رسمی.',
    instructions: '۱. با مرورگر یا اپ وارد حساب Canva خود شوید.\n۲. روی لینک فعال‌سازی کلیک کرده و Join Team را بزنید.\n۳. اکنون تمام قابلیت‌های پرمیوم و هوش مصنوعی برای اکانت شما فعال شده است!',
    code: '',
    link: 'https://www.canva.com/brand/join?token=jnqbZ6tufkd9g4PTYW7-xg&referrer=team-invite',
    date: '2026-09-21',
    tags: ['canva', 'کانوا', 'طراحی', 'گرافیک', 'دیزاین', 'pro', 'ادیت', 'پرمیوم', 'تیم']
  },
  {
    id: 'deal_udemy_photoshop',
    title: 'دوره جامع آموزش نقاشی و طراحی در فتوشاپ (Udemy)',
    category: 'udemy',
    badge: '🎨 ۱۰۰٪ رایگان با مدرک',
    description: 'دوره کامل Learn to Draw with Photoshop در پلتفرم یودمی با کوپن مستقیم رایگان و دسترسی مادام‌العمر.',
    instructions: 'روی لینک زیر کلیک کنید تا کوپن FREE-PS به طور خودکار اعمال شود و با زدن دکمه Enroll Now دوره را به اکانت خود اضافه کنید.',
    code: 'FREE-PS',
    link: 'https://www.udemy.com/course/learn-to-draw-complete-drawing-course/?couponCode=FREE-PS',
    date: '2026-09-21',
    tags: ['udemy', 'یودمی', 'photoshop', 'فتوشاپ', 'طراحی', 'نقاشی', 'دیجیتال', 'کوپن']
  },
  {
    id: 'deal_udemy_office',
    title: 'دوره جامع مسترکلاس مایکروسافت آفیس (اکسل، پاورپوینت و ورد)',
    category: 'udemy',
    badge: '📊 ۱۰۰٪ رایگان با مدرک',
    description: 'دوره جامع آموزش Microsoft Office Master شامل یادگیری صفر تا صد Excel، PowerPoint و Word با لایسنس دائمی آموزشی.',
    instructions: 'روی لینک زیر کلیک کرده و گزینه Enroll Now را بزنید تا با کوپن ثبت‌شده دوره به صورت رایگان برای همیشه فعال گردد.',
    code: '394AD278D7785B5E8DB3',
    link: 'https://www.udemy.com/course/microsoft-office-training-master-excel-powerpoint-word/?couponCode=394AD278D7785B5E8DB3',
    date: '2026-09-21',
    tags: ['udemy', 'یودمی', 'office', 'آفیس', 'excel', 'اکسل', 'powerpoint', 'پاورپوینت', 'word', 'ورد', 'کوپن']
  },
  {
    id: 'deal_win_mas',
    title: 'فعال‌سازی دائمی و دیجیتال Windows 10 & 11 (روش HWID مایکروسافت)',
    category: 'licenses',
    badge: '⚡️ لایسنس مادام‌العمر',
    description: 'فعال‌سازی ۱۰۰٪ قانونی و دائمی ویندوز ۱۰ و ۱۱ از سرورهای رسمی مایکروسافت بدون نیاز به کرک و فایل‌های آلوده.',
    instructions: '۱. در ویندوز کلیدهای Win + X را بزنید و Terminal یا PowerShell را به صورت Run as Administrator باز کنید.\n۲. کد زیر را کپی و پیست کرده و اینتر بزنید:\n<code>irm https://get.activated.win | iex</code>\n۳. در پنجره باز شده عدد 1 (HWID Activation) را تایپ کنید. تمام!',
    code: 'irm https://get.activated.win | iex',
    link: 'https://github.com/massgravel/Microsoft-Activation-Scripts',
    date: '2026-09-21',
    tags: ['windows', 'ویندوز', 'لایسنس', 'مایکروسافت', '10', '11', 'فعالسازی', 'mas', 'hwid']
  },
  {
    id: 'deal_ai_models',
    title: 'دسترسی رایگان و نامحدود به Claude 3.5 Sonnet و GPT-4o',
    category: 'ai',
    badge: '🤖 پرطرفدار',
    description: 'استفاده مستقیم از قوی‌ترین مدل‌های هوش مصنوعی جهان بدون نیاز به خرید اشتراک ماهانه ۲۰ دلاری و بدون نیاز به شماره مجازی.',
    instructions: 'از طریق پلتفرم‌های ارائه‌دهنده رسمی هوش مصنوعی (مانند DuckDuckGo AI Chat و Poe) می‌توانید به طور رایگان و بدون لاگین به چت با برترین مدل‌ها بپردازید.',
    code: '',
    link: 'https://duckduckgo.com/?q=DuckDuckGo+AI+Chat&ia=chat',
    date: '2026-09-21',
    tags: ['ai', 'هوش مصنوعی', 'claude', 'gpt', 'chatgpt', 'چت جی پی تی', 'کلود', 'پرامپت']
  },
  {
    id: 'deal_udemy_pack',
    title: 'پکیج دوره‌های برنامه‌نویسی و پایتون یودمی با کوپن ۱۰۰٪ تخفیف',
    category: 'udemy',
    badge: '🎓 مدرک معتبر',
    description: 'دسترسی کاملاً رایگان به دوره‌های جامع آموزش پایتون، فرانت‌اند، هک اخلاقی و هوش مصنوعی در پلتفرم یودمی با کوپن مستقیم.',
    instructions: 'روی لینک زیر کلیک کنید، دوره مورد نظرتان را پیدا کرده و روی Enroll Now کلیک کنید تا با تخفیف ۱۰۰٪ برای همیشه به حساب یودمی شما اضافه شود.',
    code: 'AUTO_APPLIED',
    link: 'https://www.discudemy.com/all',
    date: '2026-09-21',
    tags: ['udemy', 'یودمی', 'پایتون', 'python', 'دوره', 'آموزش', 'برنامه نویسی', 'تخفیف', 'کوپن']
  },
  {
    id: 'deal_proton_wireguard',
    title: 'کانفیگ رایگان و نامحدود Proton VPN (پروتکل وایرگارد)',
    category: 'vpn',
    badge: '🛡 ضد فیلتر',
    description: 'دریافت کانفیگ‌های رسمی و پرسرعت پروتون وی‌پی‌ان با حجم نامحدود برای اتصال ایمن در تمام اپراتورها.',
    instructions: '۱. وارد سایت Proton شوید و حساب Free بسازید.\n۲. به بخش Downloads > WireGuard Configuration بروید.\n۳. یک سرور انتخاب کرده و فایل یا QR کد را در کلاینت WireGuard وارد کنید.',
    code: '',
    link: 'https://protonvpn.com/free-vpn',
    date: '2026-09-21',
    tags: ['vpn', 'وی پی ان', 'فیلترشکن', 'پروتون', 'proton', 'wireguard', 'وایرگارد', 'پروکسی']
  },
  {
    id: 'deal_github_student',
    title: 'پک دانشجویی گیت‌هاب (GitHub Student Pack) به ارزش ۲۵۰۰ دلار',
    category: 'freebies',
    badge: '💎 طلایی',
    description: 'شامل اکانت رایگان GitHub Copilot، لایسنس کامل محصولات JetBrains، سرورهای ابری DigitalOcean و دامنه رایگان Namecheap.',
    instructions: 'با ورود به سایت GitHub Education و ثبت ایمیل دانشگاهی یا ارائه مدرک تحصیلی، پکیج کامل را به صورت یک‌ساله و رایگان فعال کنید.',
    code: '',
    link: 'https://education.github.com/pack',
    date: '2026-09-21',
    tags: ['github', 'گیت هاب', 'دانشجویی', 'کوپایلوت', 'هاست', 'دامنه', 'jetbrains', 'رایگان']
  },
  {
    id: 'deal_cursor_ai',
    title: 'ترفند دسترسی رایگان و نامحدود به ادیتور هوش مصنوعی Cursor AI',
    category: 'ai',
    badge: '⚡️ ویژه برنامه‌نویسان',
    description: 'قوی‌ترین ادیتور کد مبتنی بر VS Code مجهز به هوش مصنوعی با قابلیت بازتولید دوره‌های ترایال Pro.',
    instructions: 'ادیتور Cursor را از سایت رسمی دانلود کنید و پس از پایان تریال، با اسکریپت رسمی ریست شناسه دستگاه مجدداً از امکانات پرو بهره‌مند شوید.',
    code: '',
    link: 'https://cursor.com',
    date: '2026-09-21',
    tags: ['cursor', 'ai', 'کدنویسی', 'برنامه نویسی', 'ادیتور', 'vscode', 'هوش مصنوعی']
  },
  {
    id: 'deal_bitdefender_promo',
    title: 'لایسنس قانونی و رسمی ۱۸۰ روزه Bitdefender Total Security',
    category: 'licenses',
    badge: '🛡 امنیت تضمینی',
    description: 'محافظت کامل از ویندوز، مک و اندروید با قوی‌ترین موتور ضد ویروس و ضد باج‌افزار جهان بدون نیاز به پرداخت هزینه.',
    instructions: 'با ورود به صفحه پروموشن رسمی بیت‌دیفندر، ایمیل خود را وارد کرده و لینک تایید را در حساب Bitdefender Central خود فعال کنید.',
    code: '',
    link: 'https://t.me/rad_protocol',
    date: '2026-09-21',
    tags: ['bitdefender', 'بیت دیفندر', 'آنتی ویروس', 'امنیت', 'لایسنس', 'ویندوز', 'antivirus']
  }
];

function initDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: {},
      deals: DEFAULT_DEALS,
      stats: {
        totalAlertsSent: 0,
        totalSearches: 0,
        startedAt: new Date().toISOString()
      }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      let changed = false;
      if (!Array.isArray(data.deals) || data.deals.length === 0) {
        data.deals = DEFAULT_DEALS;
        changed = true;
      }
      if (!data.stats) {
        data.stats = { totalAlertsSent: 0, totalSearches: 0, startedAt: new Date().toISOString() };
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      }
    } catch (e) {
      console.error('Error verifying DB during init:', e.message);
    }
  }
}

function readDb() {
  try {
    initDb();
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading DB:', err.message);
    return { users: {}, deals: DEFAULT_DEALS, stats: { totalAlertsSent: 0, totalSearches: 0 } };
  }
}

function writeDb(data) {
  try {
    initDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing DB:', err.message);
  }
}

function getCategories() {
  return CATEGORIES;
}

function registerUser(from) {
  if (!from || !from.id) return null;
  const db = readDb();
  const userId = String(from.id);
  const now = new Date().toISOString();

  if (!db.users[userId]) {
    db.users[userId] = {
      id: from.id,
      first_name: from.first_name || '',
      username: from.username || '',
      firstSeen: now,
      lastSeen: now,
      alerts: {
        udemy: true,
        vpn: true,
        ai: true,
        design: true,
        licenses: true,
        freebies: true
      },
      searchCount: 0
    };
  } else {
    db.users[userId].lastSeen = now;
    if (from.first_name) db.users[userId].first_name = from.first_name;
    if (from.username) db.users[userId].username = from.username;
    if (!db.users[userId].alerts) {
      db.users[userId].alerts = {
        udemy: true,
        vpn: true,
        ai: true,
        design: true,
        licenses: true,
        freebies: true
      };
    }
  }
  writeDb(db);
  return db.users[userId];
}

function getUser(userId) {
  const db = readDb();
  return db.users[String(userId)] || null;
}

function toggleAlert(userId, categoryKey) {
  const db = readDb();
  const uid = String(userId);
  if (!db.users[uid]) {
    db.users[uid] = {
      id: Number(userId),
      alerts: { udemy: true, vpn: true, ai: true, design: true, licenses: true, freebies: true }
    };
  }
  if (!db.users[uid].alerts) {
    db.users[uid].alerts = { udemy: true, vpn: true, ai: true, design: true, licenses: true, freebies: true };
  }
  db.users[uid].alerts[categoryKey] = !db.users[uid].alerts[categoryKey];
  writeDb(db);
  return db.users[uid].alerts[categoryKey];
}

function setAllAlerts(userId, enabled) {
  const db = readDb();
  const uid = String(userId);
  if (!db.users[uid]) {
    db.users[uid] = { id: Number(userId), alerts: {} };
  }
  db.users[uid].alerts = {
    udemy: enabled,
    vpn: enabled,
    ai: enabled,
    design: enabled,
    licenses: enabled,
    freebies: enabled
  };
  writeDb(db);
  return db.users[uid].alerts;
}

function getAlertSubscribers(categoryKey) {
  const db = readDb();
  const result = [];
  for (const [userId, user] of Object.entries(db.users || {})) {
    if (user.alerts && user.alerts[categoryKey]) {
      result.push(userId);
    }
  }
  return result;
}

function getAllUserIds() {
  const db = readDb();
  return Object.keys(db.users || {});
}

function getDeals(categoryKey = null, limit = 10, offset = 0) {
  const db = readDb();
  let list = db.deals || [];
  if (categoryKey && categoryKey !== 'all') {
    list = list.filter(d => d.category === categoryKey);
  }
  return list.slice(offset, offset + limit);
}

function getDealsCount(categoryKey = null) {
  const db = readDb();
  let list = db.deals || [];
  if (categoryKey && categoryKey !== 'all') {
    list = list.filter(d => d.category === categoryKey);
  }
  return list.length;
}

function getDealById(id) {
  const db = readDb();
  return (db.deals || []).find(d => d.id === id) || null;
}

function getRandomDeal() {
  const db = readDb();
  const deals = db.deals || [];
  if (deals.length === 0) return null;
  const idx = Math.floor(Math.random() * deals.length);
  return deals[idx];
}

function searchDeals(query) {
  if (!query) return [];
  const db = readDb();
  const q = query.trim().toLowerCase();
  const deals = db.deals || [];

  return deals.filter(d => {
    const titleMatch = (d.title || '').toLowerCase().includes(q);
    const descMatch = (d.description || '').toLowerCase().includes(q);
    const catMatch = (d.category || '').toLowerCase().includes(q);
    const catNameMatch = CATEGORIES[d.category] && CATEGORIES[d.category].name.toLowerCase().includes(q);
    const tagsMatch = Array.isArray(d.tags) && d.tags.some(t => t.toLowerCase().includes(q));
    return titleMatch || descMatch || catMatch || catNameMatch || tagsMatch;
  });
}

function addDeal(deal) {
  const db = readDb();
  if (!db.deals) db.deals = [];
  const newDeal = {
    id: deal.id || `deal_${Date.now()}`,
    title: deal.title || 'آفر جدید',
    category: deal.category || 'freebies',
    badge: deal.badge || '🔥 جدید',
    description: deal.description || '',
    instructions: deal.instructions || '',
    code: deal.code || '',
    link: deal.link || 'https://t.me/rad_protocol',
    date: deal.date || new Date().toISOString().split('T')[0],
    tags: Array.isArray(deal.tags) ? deal.tags : (deal.tags || '').split(',').map(s => s.trim()).filter(Boolean)
  };
  db.deals.unshift(newDeal);
  writeDb(db);
  return newDeal;
}

function deleteDeal(id) {
  const db = readDb();
  if (!db.deals) return false;
  const initialLen = db.deals.length;
  db.deals = db.deals.filter(d => d.id !== id);
  if (db.deals.length !== initialLen) {
    writeDb(db);
    return true;
  }
  return false;
}

function recordSearch(userId) {
  const db = readDb();
  if (!db.stats) db.stats = {};
  db.stats.totalSearches = (db.stats.totalSearches || 0) + 1;
  if (userId && db.users && db.users[String(userId)]) {
    db.users[String(userId)].searchCount = (db.users[String(userId)].searchCount || 0) + 1;
  }
  writeDb(db);
}

function recordAlertSent(count = 1) {
  const db = readDb();
  if (!db.stats) db.stats = {};
  db.stats.totalAlertsSent = (db.stats.totalAlertsSent || 0) + count;
  writeDb(db);
}

function getStats() {
  const db = readDb();
  const users = db.users || {};
  const userCount = Object.keys(users).length;
  const dealsCount = (db.deals || []).length;

  const categoryCounts = {};
  for (const catKey of Object.keys(CATEGORIES)) {
    categoryCounts[catKey] = (db.deals || []).filter(d => d.category === catKey).length;
  }

  const alertSubscriptions = {};
  for (const catKey of Object.keys(CATEGORIES)) {
    let count = 0;
    for (const u of Object.values(users)) {
      if (u.alerts && u.alerts[catKey]) count++;
    }
    alertSubscriptions[catKey] = count;
  }

  return {
    totalUsers: userCount,
    totalDeals: dealsCount,
    totalAlertsSent: (db.stats && db.stats.totalAlertsSent) || 0,
    totalSearches: (db.stats && db.stats.totalSearches) || 0,
    startedAt: db.stats && db.stats.startedAt,
    categoryCounts,
    alertSubscriptions
  };
}

module.exports = {
  CATEGORIES,
  DEFAULT_DEALS,
  initDb,
  readDb,
  writeDb,
  getCategories,
  registerUser,
  getUser,
  toggleAlert,
  setAllAlerts,
  getAlertSubscribers,
  getAllUserIds,
  getDeals,
  getDealsCount,
  getDealById,
  getRandomDeal,
  searchDeals,
  addDeal,
  deleteDeal,
  recordSearch,
  recordAlertSent,
  getStats
};