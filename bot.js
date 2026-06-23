const http = require('http');
const axios = require('axios');
const Parser = require('rss-parser');
const { createClient } = require('@supabase/supabase-js');

const parser = new Parser({ timeout: 15000 });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ENV_CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const RUN_SECRET = process.env.RUN_SECRET || '';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ─── FEED KAYNAKLARI ─────────────────────────────────────────────
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
  { name: 'IGN Türkiye', url: 'https://tr.ign.com/feed.xml', category: 'oyun', siteLink: 'https://deutschturkhaber.com' },
  { name: 'Turkmmo', url: 'https://www.turkmmo.com/feed', category: 'oyun', siteLink: 'https://deutschturkhaber.com' },
  { name: 'Mobidictum', url: 'https://mobidictum.com/tr/feed/', category: 'oyun', siteLink: 'https://deutschturkhaber.com' },
  { name: 'Stadt Köln', url: 'http://www.stadt-koeln.de/externe-dienste/rss/pressemeldungen.xml', category: 'koln', siteLink: 'https://deutschturkhaber.com' },
  { name: 'WDR Rheinland', url: 'https://www1.wdr.de/nachrichten/rheinland/uebersicht-rheinland-100.feed', category: 'koln', siteLink: 'https://deutschturkhaber.com' },
  { name: 'National Geographic', url: 'https://www.nationalgeographic.com/science/rss', category: 'bilim', siteLink: 'https://deutschturkhaber.com' },
  { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml', category: 'bilim', siteLink: 'https://deutschturkhaber.com' },
];

const CATEGORY_TAGS = {
  gundem: ['#Türkiye', '#Gündem', '#SonDakika'],
  almanya: ['#Almanya', '#Deutschland', '#Avrupa'],
  spor: ['#Spor', '#Futbol', '#SüperLig'],
  teknoloji: ['#Teknoloji', '#YapayZeka', '#Tech'],
  sinema: ['#Sinema', '#Film', '#Dizi'],
  oyun: ['#Oyun', '#Gaming', '#VideoOyun'],
  koln: ['#Köln', '#NRW', '#Almanya'],
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
  [/playstation|ps5|ps4/i, '#PlayStation'],
  [/xbox/i, '#Xbox'],
  [/nintendo|switch/i, '#Nintendo'],
  [/steam\b/i, '#Steam'],
  [/fortnite/i, '#Fortnite'],
  [/minecraft/i, '#Minecraft'],
  [/\bgta\b|grand theft auto/i, '#GTA'],
  [/roblox/i, '#Roblox'],
  [/league of legends|\blol\b/i, '#LeagueOfLegends'],
  [/valorant/i, '#Valorant'],
  [/e[- ]?spor|esports/i, '#Espor'],
  [/twitch/i, '#Twitch'],
  [/youtube|youtuber/i, '#YouTube'],
  [/anime|manga/i, '#Anime'],
  [/k-?pop|bts|blackpink/i, '#KPop'],
  [/instagram/i, '#Instagram'],
  [/tiktok/i, '#TikTok'],
  [/discord/i, '#Discord'],
  [/köln|koeln/i, '#Köln'],
  [/düsseldorf/i, '#Düsseldorf'],
  [/dortmund/i, '#Dortmund'],
  [/bonn\b/i, '#Bonn'],
  [/euskirchen/i, '#Euskirchen'],
  [/eifel/i, '#Eifel'],
  [/nrw|nordrhein-westfalen/i, '#NRW'],
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

async function aiHashtagsOlustur(title, category) {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const r = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      system: 'Sen bir sosyal medya editörüsün. Verilen Türkçe haber başlığına ve kategoriye göre X (Twitter) için en alakalı, doğru ve mümkünse trend olabilecek 4-6 Türkçe hashtag üret. SADECE hashtagleri boşlukla ayrılmış şekilde yaz; hiçbir açıklama, numara veya ek cümle ekleme. Format: #KelimeBirleşik şeklinde, Türkçe karakterleri koru.',
      messages: [{ role: 'user', content: `Başlık: ${title}\nKategori: ${category}` }],
    }, {
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      timeout: 10000,
    });
    const text = r.data?.content?.[0]?.text?.trim();
    if (!text) return null;
    const tags = text.split(/\s+/).filter((t) => t.startsWith('#')).slice(0, 6);
    return tags.length ? tags.join(' ') : null;
  } catch (e) {
    console.error('AI hashtag hatasi:', e.response ? JSON.stringify(e.response.data) : e.message);
    return null;
  }
}

// ─── SUPABASE YARDIMCILARI (kalıcı hafıza) ───────────────────────
async function getMeta(key) {
  if (!supabase) return null;
  const { data } = await supabase.from('bot_meta').select('value').eq('key', key).maybeSingle();
  return data ? data.value : null;
}
async function setMeta(key, value) {
  if (!supabase) return;
  await supabase.from('bot_meta').upsert({ key, value: String(value) });
}

async function loadSubscribers() {
  const set = new Set();
  if (ENV_CHAT_ID) set.add(String(ENV_CHAT_ID));
  if (!supabase) return set;
  const { data } = await supabase.from('bot_subscribers').select('chat_id');
  (data || []).forEach((r) => set.add(String(r.chat_id)));
  return set;
}
async function addSubscriber(chatId) {
  if (!supabase) return;
  await supabase.from('bot_subscribers').upsert({ chat_id: String(chatId) });
}
async function removeSubscriber(chatId) {
  if (!supabase) return;
  await supabase.from('bot_subscribers').delete().eq('chat_id', String(chatId));
}

async function loadSeenLinks() {
  if (!supabase) return new Set();
  const { data } = await supabase.from('bot_seen_links').select('link');
  return new Set((data || []).map((r) => r.link));
}
async function markSeen(links) {
  if (!supabase || !links.length) return;
  const rows = links.map((l) => ({ link: l }));
  // Çok büyük listeleri parça parça ekle (Supabase tek istekte sınırlı veri kabul eder)
  for (let i = 0; i < rows.length; i += 200) {
    const parca = rows.slice(i, i + 200);
    await supabase.from('bot_seen_links').upsert(parca, { onConflict: 'link', ignoreDuplicates: true });
  }
}
async function cleanupOldSeenLinks() {
  if (!supabase) return;
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('bot_seen_links').delete().lt('seen_at', cutoff);
}

// ─── TELEGRAM ─────────────────────────────────────────────────────
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

async function broadcast(subscribers, text) {
  for (const chatId of subscribers) {
    await sendMessage(chatId, text);
    await sleep(400);
  }
}

async function pollTelegramOnce(subscribers, seenLinksCount) {
  const offsetStr = await getMeta('telegram_offset');
  const offset = offsetStr ? parseInt(offsetStr, 10) + 1 : 0;
  try {
    const res = await axios.get(`${TELEGRAM_API}/getUpdates`, {
      params: { offset, timeout: 0 },
      timeout: 10000,
    });
    const updates = res.data.result || [];
    let lastId = null;
    for (const update of updates) {
      lastId = update.update_id;
      const msg = update.message;
      if (!msg) continue;
      const text = (msg.text || '').trim();
      const chatId = msg.chat.id;
      if (text === '/start') {
        await addSubscriber(chatId);
        subscribers.add(String(chatId));
        await sendMessage(chatId, '✅ Kayıt oldun! Yeni haberler buldukça sana göndereceğim (en fazla 20 dakikada bir kontrol ediliyor).\n\nKaynaklar: ' + FEEDS.map((f) => f.name).join(', '));
      } else if (text === '/stop') {
        await removeSubscriber(chatId);
        subscribers.delete(String(chatId));
        await sendMessage(chatId, '🛑 Bildirimler durduruldu. Tekrar başlamak için /start yaz.');
      } else if (text === '/durum' || text === '/status') {
        await sendMessage(chatId, `Bot çalışıyor.\nKaynak sayısı: ${FEEDS.length}\nGörülen haber sayısı: ${seenLinksCount}\nAbone sayısı: ${subscribers.size}`);
      } else if (text === '/id') {
        await sendMessage(chatId, `Chat ID: ${chatId}`);
      }
    }
    if (lastId !== null) await setMeta('telegram_offset', lastId);
  } catch (e) {
    console.error('Update alma hatasi:', e.response ? JSON.stringify(e.response.data) : e.message);
  }
}

// ─── HABER KONTROLÜ (tek seferlik çalışma) ───────────────────────
async function checkAllFeedsOnce(seenLinks, subscribers, initialized) {
  const newlySeen = [];
  let gonderilen = 0;

  for (const feed of FEEDS) {
    try {
      const data = await parser.parseURL(feed.url);
      const items = (data.items || []).slice(0, 15);
      for (const item of items) {
        const link = item.link || item.guid;
        if (!link || seenLinks.has(link)) continue;
        seenLinks.add(link);
        newlySeen.push(link);

        // İlk çalıştırmada (initialized=false): sadece "görüldü" olarak işaretle, gönderme.
        // Bu, kurulum anında bot'un eski haber arşivini Telegram'a boşaltmasını engeller.
        if (!initialized) continue;

        const title = (item.title || '').trim();
        let hashtags = await aiHashtagsOlustur(title, feed.category);
        if (!hashtags) hashtags = generateHashtags(title, feed.category);
        const message = `${title}\n${link}\n\n🌐 ${feed.siteLink}\n\n${hashtags}`;
        await broadcast(subscribers, message);
        gonderilen++;
        console.log('Gonderildi:', feed.name, '-', title.substring(0, 60));
      }
    } catch (e) {
      console.error(`${feed.name} hatasi:`, e.message);
    }
  }

  return { newlySeen, gonderilen };
}

// ─── TEK SEFERLİK ÇALIŞMA (cron tetiklemesiyle) ──────────────────
async function runOnce() {
  if (!supabase) {
    return { ok: false, hata: 'SUPABASE bağlantısı yok (env değişkenleri kontrol edin)' };
  }

  const initializedStr = await getMeta('initialized');
  const initialized = initializedStr === 'true';

  const subscribers = await loadSubscribers();
  const seenLinks = await loadSeenLinks();

  await pollTelegramOnce(subscribers, seenLinks.size);

  const { newlySeen, gonderilen } = await checkAllFeedsOnce(seenLinks, subscribers, initialized);

  await markSeen(newlySeen);
  if (!initialized) await setMeta('initialized', 'true');
  await cleanupOldSeenLinks();

  return {
    ok: true,
    ilkCalisma: !initialized,
    yeniHaberSayisi: newlySeen.length,
    gonderilenMesaj: gonderilen,
    aboneSayisi: subscribers.size,
  };
}

// ─── HTTP SUNUCU (cron-job.org tarafından tetiklenir) ────────────
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/run') {
    if (RUN_SECRET && u.searchParams.get('secret') !== RUN_SECRET) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, hata: 'Yetkisiz' }));
      return;
    }
    try {
      const sonuc = await runOnce();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sonuc));
    } catch (e) {
      console.error('runOnce hatasi:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, hata: e.message }));
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Taner Haber Bot ayakta. Tetiklemek için: /run?secret=...');
}).listen(process.env.PORT || 3000, () => {
  console.log('Taner Haber Bot (cron-tetikli) basladi, port ' + (process.env.PORT || 3000));
});
