const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');
const cron = require('node-cron');
const { google } = require('googleapis');
const { createCanvas, loadImage } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const http = require('http');
const url = require('url');
const path = require('path');

const CONTACT_EMAIL = 'tanerkomtan@gmail.com';

const xClient = new TwitterApi({
  appKey: process.env.X_API_KEY,
  appSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
});
const rwClient = xClient.readWrite;
const postedIds = new Set();

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'https://taner-xbot.onrender.com/callback'
);
const TOKENS_FILE = '/tmp/yt_tokens.json';
let ytAuthorized = false;

function loadYTTokens() {
  try {
    let tokens = {};
    if (process.env.YT_TOKENS) {
      tokens = JSON.parse(process.env.YT_TOKENS);
    } else if (fs.existsSync(TOKENS_FILE)) {
      tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    }
    if (tokens.access_token) {
      oauth2Client.setCredentials(tokens);
      ytAuthorized = true;
      console.log('YouTube tokens yuklendi');
    }
  } catch (e) { console.error('Token yuklenemedi:', e.message); }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens));
}

oauth2Client.on('tokens', (tokens) => {
  const current = fs.existsSync(TOKENS_FILE) ? JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')) : {};
  const merged = { ...current, ...tokens };
  saveTokens(merged);
  ytAuthorized = true;
});

loadYTTokens();

async function getHackerNews() {
  try {
    const res = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json', { timeout: 10000 });
    const ids = res.data.slice(0, 30).filter(id => !postedIds.has('hn_' + id));
    if (ids.length === 0) return null;
    const randomId = ids[Math.floor(Math.random() * ids.length)];
    const story = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${randomId}.json`, { timeout: 10000 });
    if (!story.data || !story.data.title) return null;
    postedIds.add('hn_' + randomId);
    return { title: story.data.title, url: story.data.url || `https://news.ycombinator.com/item?id=${randomId}`, tag: '#tech #hackernews', image: null };
  } catch (e) { console.error('HackerNews hatasi:', e.message); return null; }
}

async function getNewsAPI() {
  try {
    const categories = ['technology', 'science', 'world', 'business'];
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const res = await axios.get(`https://newsapi.org/v2/top-headlines?category=${cat}&language=en&apiKey=${process.env.NEWS_API_KEY}`, { timeout: 10000 });
    const articles = res.data.articles.filter(a => !postedIds.has('news_' + a.url));
    if (articles.length === 0) return null;
    const article = articles[Math.floor(Math.random() * articles.length)];
    postedIds.add('news_' + article.url);
    return { title: article.title, url: article.url, tag: `#${cat} #news #trending`, image: article.urlToImage || null };
  } catch (e) { console.error('NewsAPI hatasi:', e.message); return null; }
}

async function getNASA() {
  try {
    const res = await axios.get(`https://api.nasa.gov/planetary/apod?api_key=${process.env.NASA_API_KEY || 'DEMO_KEY'}`, { timeout: 10000 });
    const id = 'nasa_' + res.data.date;
    if (postedIds.has(id)) return null;
    postedIds.add(id);
    return { title: `🌌 NASA Photo of the Day: ${res.data.title}`, url: res.data.url, tag: '#NASA #space #astronomy', image: res.data.media_type === 'image' ? res.data.url : null };
  } catch (e) { console.error('NASA hatasi:', e.message); return null; }
}

async function getWikipedia() {
  try {
    const today = new Date();
    const res = await axios.get(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${today.getMonth() + 1}/${today.getDate()}`, { timeout: 10000 });
    const events = res.data.events;
    if (!events || events.length === 0) return null;
    const event = events[Math.floor(Math.random() * Math.min(events.length, 10))];
    const id = 'wiki_' + event.year + '_' + today.getDate();
    if (postedIds.has(id)) return null;
    postedIds.add(id);
    const page = event.pages && event.pages[0] ? event.pages[0] : null;
    return { title: `📅 On this day in ${event.year}: ${event.text}`, url: page ? page.content_urls.desktop.page : 'https://wikipedia.org', tag: '#onthisday #history #facts', image: page && page.thumbnail ? page.thumbnail.source : null };
  } catch (e) { console.error('Wikipedia hatasi:', e.message); return null; }
}

async function getViralContent() {
  const sources = [getHackerNews, getNewsAPI, getNewsAPI, getNASA, getWikipedia];
  const shuffled = sources.sort(() => Math.random() - 0.5);
  for (const source of shuffled) {
    const content = await source();
    if (content) return content;
  }
  return null;
}

async function postToX() {
  const content = await getViralContent();
  if (!content) { console.log('Icerik bulunamadi'); return; }
  const title = content.title.substring(0, 200);
  const tweet = `${title}\n\n${content.url}\n\n${content.tag}`;
  try {
    await rwClient.v2.tweet(tweet);
    console.log('Tweet atildi:', title.substring(0, 60));
  } catch (e) { console.error('Tweet hatasi:', e.message); }
}

async function createVideo(content) {
  const width = 1080, height = 1920;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  let bgImg = null;
  if (content.image) {
    try {
      const r = await axios.get(content.image, { responseType: 'arraybuffer', timeout: 12000 });
      bgImg = await loadImage(Buffer.from(r.data));
    } catch (e) { console.error('Gorsel yuklenemedi:', e.message); bgImg = null; }
  }

  if (bgImg) {
    const scale = Math.max(width / bgImg.width, height / bgImg.height);
    const w = bgImg.width * scale, h = bgImg.height * scale;
    ctx.drawImage(bgImg, (width - w) / 2, (height - h) / 2, w, h);
    const ov = ctx.createLinearGradient(0, 0, 0, height);
    ov.addColorStop(0, 'rgba(10,5,30,0.78)');
    ov.addColorStop(0.45, 'rgba(10,5,30,0.25)');
    ov.addColorStop(1, 'rgba(10,5,30,0.92)');
    ctx.fillStyle = ov;
    ctx.fillRect(0, 0, width, height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0f0c29');
    gradient.addColorStop(0.5, '#302b63');
    gradient.addColorStop(1, '#24243e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = '#ff3b5c';
  ctx.fillRect(0, 0, width, 14);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('🤖 Taner Bot', width / 2, 140);
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 66px sans-serif';
  const words = content.title.split(' ');
  let lines = [], line = '';
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (ctx.measureText(test).width > 940 && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > 9) lines = lines.slice(0, 9);
  const lineHeight = 88;
  const startY = height / 2 - (lines.length * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, width / 2, startY + i * lineHeight));
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff8fa3';
  ctx.font = 'bold 44px sans-serif';
  ctx.fillText(content.tag + ' #fyp', width / 2, height - 170);

  const framePath = '/tmp/frame.png';
  const videoPath = '/tmp/short.mp4';

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(framePath);
    canvas.createPNGStream().pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(framePath).inputOptions(['-loop 1'])
      .outputOptions(['-c:v libx264', '-t 25', '-pix_fmt yuv420p', '-r 30', '-vf scale=1080:1920,fade=t=in:st=0:d=0.6,fade=t=out:st=23.5:d=1'])
      .output(videoPath)
      .on('end', () => { console.log('Video hazir'); resolve(videoPath); })
      .on('error', reject)
      .run();
  });
}

async function uploadToYouTube(videoPath, content) {
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: content.title.substring(0, 100), description: `${content.title}\n\n${content.url}\n\n${content.tag} #Shorts`, tags: ['shorts', 'news', 'trending'], categoryId: '25' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(videoPath) },
  });
  console.log('YouTube Shorts yuklendi! ID:', res.data.id);
}

async function postToYouTube() {
  if (!ytAuthorized) { console.log('YouTube yetkisi yok!'); return; }
  try {
    const content = await getViralContent();
    if (!content) return;
    const videoPath = await createVideo(content);
    await uploadToYouTube(videoPath, content);
    try { fs.unlinkSync(videoPath); fs.unlinkSync('/tmp/frame.png'); } catch (e) {}
  } catch (e) { console.error('YouTube hatasi:', e.message); }
}

// ─── SAYFA STILI (header ile birlikte) ──────────────────────
const PAGE_STYLE = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#222;line-height:1.6}
  header{background:#000;color:#fff;padding:14px 32px;display:flex;align-items:center;gap:12px}
  header img{width:40px;height:40px;border-radius:8px;object-fit:cover}
  header span{font-size:18px;font-weight:600}
  .content{max-width:760px;margin:40px auto;padding:0 24px 60px}
  h1{font-size:1.7em;margin-bottom:6px}
  h2{font-size:1.1em;margin-top:28px;margin-bottom:8px;color:#111}
  p{margin-bottom:10px;color:#444}
  small{color:#888;font-size:13px}
  footer{text-align:center;padding:24px;color:#aaa;font-size:12px;border-top:1px solid #eee}
`;

// ─── TERMS OF SERVICE ───────────────────────────────────────
const TERMS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>taner-xbot Terms of Service</title>
  <link rel="icon" href="/icon.png" type="image/png">
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <header>
    <img src="/icon.png" alt="taner-xbot icon">
    <span>taner-xbot Terms of Service</span>
  </header>
  <div class="content">
    <h1>taner-xbot Terms of Service</h1>
    <small>Last updated: May 2026</small>
    <h2>1. Description of the Service</h2>
    <p>taner-xbot is a web application that automatically collects publicly available content from sources such as Hacker News, NASA APOD, Wikipedia, and public news APIs, and publishes summaries and links to social media platforms (including X/Twitter, YouTube, and TikTok) that the operator has authorized.</p>
    <h2>2. Authorized Use</h2>
    <p>The Service may only be used to publish content to social media accounts that you own or are authorized to manage. You agree to comply with the terms and policies of every platform the Service connects to, including X, YouTube, and TikTok.</p>
    <h2>3. TikTok API Usage</h2>
    <p>When connected to TikTok, the Service uses the TikTok Content Posting API to upload and publish video content to your TikTok account on your behalf. You authorize this connection through TikTok's official OAuth flow.</p>
    <h2>4. Third-Party Content</h2>
    <p>Content published by the Service originates from third-party public sources. We do not claim ownership of that content and are not responsible for its accuracy.</p>
    <h2>5. No Warranty</h2>
    <p>The Service is provided "as is" without warranties of any kind. We do not guarantee uninterrupted or error-free operation.</p>
    <h2>6. Limitation of Liability</h2>
    <p>To the maximum extent permitted by law, the operator shall not be liable for any indirect, incidental, or consequential damages arising from use of the Service.</p>
    <h2>7. Changes</h2>
    <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
    <h2>8. Contact</h2>
    <p>For questions about these Terms, contact: <strong>${CONTACT_EMAIL}</strong></p>
  </div>
  <footer>&copy; 2026 taner-xbot. All rights reserved.</footer>
</body>
</html>`;

// ─── PRIVACY POLICY ─────────────────────────────────────────
const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>taner-xbot Privacy Policy</title>
  <link rel="icon" href="/icon.png" type="image/png">
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <header>
    <img src="/icon.png" alt="taner-xbot icon">
    <span>taner-xbot Privacy Policy</span>
  </header>
  <div class="content">
    <h1>taner-xbot Privacy Policy</h1>
    <small>Last updated: May 2026</small>
    <h2>1. Information We Collect</h2>
    <p>taner-xbot stores only the authentication tokens (OAuth access and refresh tokens) provided by connected platforms such as YouTube, X, and TikTok. These tokens are used solely to publish content to the operator's own authorized accounts. The Service does not collect names, email addresses, passwords, contact lists, or browsing data from any third party.</p>
    <h2>2. How We Use Information</h2>
    <p>Authentication tokens are used only to perform the actions you authorize: publishing posts and uploading videos to the connected accounts. We do not use this information for advertising or profiling.</p>
    <h2>3. TikTok API Data</h2>
    <p>When you connect your TikTok account, we use the TikTok Login Kit to authenticate you and the Content Posting API to upload videos on your behalf. Data obtained through the TikTok API is used exclusively for content publishing and is handled in accordance with TikTok's Platform Policy.</p>
    <h2>4. Data Storage and Retention</h2>
    <p>Tokens are stored securely on the server only for as long as needed to operate the Service. They can be revoked at any time from the connected platform's security settings, after which the Service can no longer access the account.</p>
    <h2>5. Data Sharing</h2>
    <p>We do not sell, rent, or share stored information with third parties, except as required to deliver content to the platforms you have authorized.</p>
    <h2>6. Your Rights</h2>
    <p>You may revoke the Service's access to any connected account at any time through that platform's settings. You may also request deletion of stored tokens by contacting us.</p>
    <h2>7. Contact</h2>
    <p>For questions about this Privacy Policy, contact: <strong>${CONTACT_EMAIL}</strong></p>
  </div>
  <footer>&copy; 2026 taner-xbot. All rights reserved.</footer>
</body>
</html>`;

cron.schedule('0,20,40 * * * *', () => { postToX(); });
cron.schedule('0 */3 * * *', () => { postToYouTube(); });

console.log('Taner X Bot basladi!');
postToX();

http.createServer(async (req, res) => {
  const p = url.parse(req.url, true);

  // ─── İKON DOSYASI ─────────────────────────────────────────
  if (p.pathname === '/icon.png') {
    const iconPath = path.join(__dirname, 'icon.png');
    if (fs.existsSync(iconPath)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(iconPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('icon not found');
    }
    return;
  }

  if (p.pathname === '/') {
    res.end('Bot calisiyor! YouTube: ' + (ytAuthorized ? '✅ Bagli' : '❌ /auth adresine git'));
  } else if (p.pathname === '/auth') {
    const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/youtube.upload'], prompt: 'consent' });
    res.writeHead(302, { Location: authUrl });
    res.end();
  } else if (p.pathname === '/callback') {
    const code = p.query.code;
    if (!code) { res.end('Hata: code bulunamadi'); return; }
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      saveTokens(tokens);
      ytAuthorized = true;
      res.end('✅ YouTube baglantisi basarili! Token: ' + JSON.stringify(tokens));
    } catch (e) { res.end('Hata: ' + e.message); }
  } else if (p.pathname === '/upload-now') {
    res.end('YouTube Shorts yukleniyor...');
    postToYouTube();
  } else if (p.pathname === '/preview-video') {
    try {
      const content = await getViralContent();
      if (!content) { res.end('Icerik bulunamadi, birkac saniye sonra tekrar dene.'); return; }
      const videoPath = await createVideo(content);
      const stat = fs.statSync(videoPath);
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': stat.size });
      fs.createReadStream(videoPath).pipe(res);
    } catch (e) { res.end('Video olusturma hatasi: ' + e.message); }
  } else if (p.pathname === '/get-token') {
    try {
      const t = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
      res.end(JSON.stringify(t));
    } catch (e) { res.end('Token yok'); }
  } else if (p.pathname === '/tiktokfX696rDufQBZ7kwnAW2W3SzUE4EEnAk0.txt') {
    res.end('tiktok-developers-site-verification=fX696rDufQBZ7kwnAW2W3SzUE4EEnAk0');
  } else if (p.pathname === '/terms') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(TERMS_HTML);
  } else if (p.pathname === '/privacy') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PRIVACY_HTML);
  } else {
    res.end('Bot calisiyor!');
  }
}).listen(process.env.PORT || 3000)
