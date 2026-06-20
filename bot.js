const axios = require('axios');
const Parser = require('rss-parser');
const cron = require('node-cron');
const fs = require('fs');
const http = require('http');

const parser = new Parser({ timeout: 15000 });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ENV_CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const CHAT_IDS_FILE = '/tmp/chat_ids.json';
const SEEN_FILE = '/tmp/seen_links.json';
const MAX_SEEN = 2000;

let chatIds = new Set();
let seenLinks = new Set();
let lastUpdateId = 0;

function loadJSON(path, fallback) {
  try {
    if (fs.existsSync(path)) return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (e) { console.error('Yukleme hatasi (' + path + '):', e.message); }
  return fallback;
}
function saveJSON(path, data) {
  try { fs.writeFileSync(path, JSON.stringify(data)); }
  catch (e) { console.error('Kaydetme hatasi (' + path + '):', e.message); }
}

chatIds = new Set(loadJSON(CHAT_IDS_FILE, []));
seenLinks = new Set(loadJSON(SEEN_FILE, []));
if (ENV_CHAT_ID) chatIds.add(String(ENV_CHAT_ID));

function rememberSeen(link) {
  seenLinks.add(link);
  if (seenLinks.size > MAX_SEEN) {
    const first = seenLinks.values().next().value;
    seenLinks.delete(first);
  }
  saveJSON(SEEN_FILE, Array.from(seenLinks));
}

function rememberChat(chatId) {
  const id = String(chatId);
  if (!chatIds.has(id)) {
    chatIds.add(id);
    saveJSON(CHAT_IDS_FILE, Array.from(chatIds));
    console.log('Yeni abone:', id);
  }
}

const FEEDS = [
  { name: 'NTV', url: 'https://www.ntv.com.tr/gundem.rss', category: 'gundem', siteLink: 'https://deutschturkhaber.com/turkiye' },
  { name: 'Sabah', url: 'https://www.sabah.com.tr/rss/news.xml', category: 'gundem', siteLink: 'https://deutschturkhaber.com/turkiye' },
  { name: 'Sözcü', url: 'https://www.sozcu.com.tr/feeds-rss-category-gundem', category: 'gundem', siteLink: 'https://deutschturkhaber.com/turkiye' },
  { name: 'Habertürk', url: 'http://www.haberturk.com/rss', category: 'gundem', siteLink: 'https://deutschturkhaber.com/turkiye' },
  { name: 'DW Türkçe', url: 'http://rss.dw.com/rdf/rss-tur-all', category: 'almanya', siteLink: 'https://deutschturkhaber.com/almanya' },
  { name: 'Bild', url: 'https://www.bild.de/feed/alles.xml', category: 'almanya', siteLink: 'https://deutschturkhaber.com/almanya' },
  { name: 'NTV Spor', url: 'https://www.ntv.com.tr/spor.rss', category: 'spor', siteLink: 'https://deutschturkhaber.com' },
  { name: 'Webtekno', url: 'https://www.webtekno.com/rss.xml', category: 'teknoloji', siteLink: 'https://deutschturkhaber.com' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'teknoloji', siteLink: 'https://deutschturkhaber.com' },
  { name: 'Heise', url: 'https://www.heise.de/newsticker/heise-atom.xml', category: 'teknoloji', siteLink: 'https://deutschturkhaber.com/almanya' },
  { name: 'Beyaz Perde', url: 'https://www.beyazperde.com/rss/haberler.xml', category: 'sinema', siteLink: 'https://deutschturkhaber.com' },
  { name: 'Variety', url: 'https://variety.com/feed/', category: 'sinema', siteLink: 'https://deutschturkhaber.com' },
  { name: 'National Geographic', url: 'https://www.nationalgeographic.com/science/rss', category: 'bilim', siteLink: 'https://deutschturkhaber.com' },
  { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml', category: 'bilim', siteLink: 'https://deutschturkhaber.com' },
];

const CATEGORY_TAGS = {
  gundem: ['#Türkiye', '#Gündem', '#SonDakika'],
  almanya: ['#Almanya', '#Deutschland', '#Avrupa'],
  spor: ['#Spor', '#Futbol', '#SüperLig'],
  teknoloji: ['#Teknoloji', '#YapayZeka', '#Tech'],
  sinema: ['#Sinema', '#Film', '#Dizi'],
  bilim: ['#Bilim', '#Uzay', '#Science'],
};

const KEYWORD_TAGS = [
  [/galatasaray/i, '#Galatasaray'],
  [/fenerbah[çc]e/i, '#Fenerbahçe'],
  [/be[şs]ikta[şs]/i, '#Beşiktaş'],
  [/trabzonspor/i, '#Trabzonspor'],
  [/d[üu]nya kupas[ıi]/i, '#DünyaKupası'],
  [/transfer/i, '#Transfer'],
  [/yapay zeka|\bai\b|chatgpt|openai/i, '#YapayZeka'],
  [/iphone|apple/i, '#Apple'],
  [/samsung/i, '#Samsung'],
  [/google/i, '#Google'],
  [/tesla|spacex|elon musk/i, '#Tesla'],
  [/nasa|uzay|astronomi|gezegen|space/i, '#Uzay'],
  [/deprem/i, '#Deprem'],
  [/netflix/i, '#Netflix'],
  [/hollywood|oscar|marvel|disney/i, '#Hollywood'],
  [/dizi|series/i, '#Dizi'],
  [/erdoğan/i, '#Erdoğan'],
  [/ekonomi|dolar|euro|borsa/i, '#Ekonomi'],
];

function generateHashtags(title, category) {
  const tags = new Set();
  const base = CATEGORY_TAGS[category] || ['#Haber'];
  base.slice(0, 2).forEach((t) => tags.add(t));
  for (const [regex, tag] of KEYWORD_TAGS) {
    if (tags.size >= 5) break;
    if (regex.test(title)) tags.add(tag);
  }
  return Array.from(tags).slice(0, 5).join(' ');
}

async function sendMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
    });
  } catch (e) {
    console.error('Mesaj gonderme hatasi:', e.response ? JSON.stringify(e.response.data) : e.message);
  }
}

async function broadcast(text) {
  for (const chatId of chatIds) {
    await sendMessage(chatId, text);
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function pollUpdates() {
  try {
    const res = await axios.get(`${TELEGRAM_API}/getUpdates`, {
      params: { offset: lastUpdateId + 1, timeout: 0 },
      timeout: 10000,
    });
    const updates = res.data.result || [];
    for (const update of updates) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg) continue;
      const text = (msg.text || '').trim();
      const chatId = msg.chat.id;
      if (text === '/start') {
        rememberChat(chatId);
        await sendMessage(chatId, '✅ Kayıt oldun! Yeni haberler buldukça sana göndereceğim.\n\nKaynaklar: ' + FEEDS.map(f => f.name).join(', '));
      } else if (text === '/stop') {
        chatIds.delete(String(chatId));
        saveJSON(CHAT_IDS_FILE, Array.from(chatIds));
        await sendMessage(chatId, '🛑 Bildirimler durduruldu. Tekrar başlamak için /start yaz.');
      } else if (text === '/durum' || text === '/status') {
        await sendMessage(chatId, `Bot çalışıyor.\nKaynak sayısı: ${FEEDS.length}\nGörülen haber sayısı: ${seenLinks.size}\nAbone sayısı: ${chatIds.size}`);
      } else if (text === '/id') {
        await sendMessage(chatId, `Chat ID: ${chatId}`);
      }
    }
  } catch (e) {
    console.error('Update alma hatasi:', e.response ? JSON.stringify(e.response.data) : e.message);
  }
}

const FRESHNESS_WINDOW_MS = 90 * 60 * 1000;
let isFirstRun = true;

async function checkFeed(feed) {
  try {
    const data = await parser.parseURL(feed.url);
    const items = (data.items || []).slice(0, 15);
    for (const item of items) {
      const link = item.link || item.guid;
      if (!link || seenLinks.has(link)) continue;

      const pubDateStr = item.isoDate || item.pubDate;
      const pubDate = pubDateStr ? new Date(pubDateStr) : null;
      const ageMs = pubDate && !isNaN(pubDate.getTime()) ? (Date.now() - pubDate.getTime()) : null;

      rememberSeen(link);

      const isFresh = ageMs !== null ? ageMs <= FRESHNESS_WINDOW_MS : !isFirstRun;
      if (!isFresh) continue;

      const title = (item.title || '').trim();
      const hashtags = generateHashtags(title, feed.category);
      const message = `${title}\n${link}\n\n🌐 ${feed.siteLink}\n\n${hashtags}`;
      await broadcast(message);
      console.log('Gonderildi:', feed.name, '-', title.substring(0, 60));
    }
  } catch (e) {
    console.error(`${feed.name} hatasi:`, e.message);
  }
}

async function checkAllFeeds() {
  console.log('Haber kontrolu basliyor:', new Date().toISOString());
  for (const feed of FEEDS) {
    await checkFeed(feed);
  }
  isFirstRun = false;
  console.log('Haber kontrolu tamamlandi.');
}

cron.schedule('*/20 * * * *', () => { checkAllFeeds(); });
cron.schedule('* * * * *', () => { pollUpdates(); });

console.log('Taner Haber Bot basladi!');

checkAllFeeds();
pollUpdates();

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      subscribers: chatIds.size,
      seenCount: seenLinks.size,
      feeds: FEEDS.map(f => f.name),
      uptimeSeconds: Math.floor(process.uptime()),
    }));
  } else {
    res.end('Taner Haber Bot calisiyor!');
  }
}).listen(process.env.PORT || 3000);
