# Taner Haber Bot

DeutschTürkHaber'in kullandığı kaynaklara benzer sitelerden (NTV, Sabah, Sözcü, Habertürk,
DW Türkçe, Bild, National Geographic, ScienceDaily) yeni haberleri çekip Telegram üzerinden
sana gönderen bot. X'e otomatik post YOK — sen istediğini elle paylaşırsın, kredi yemez.

## 1) Render'a Deploy Etme

1. Bu klasördeki dosyaları (`package.json`, `bot.js`) yeni bir GitHub reposuna yükle
   (örn. `taner-haber-bot`).
2. https://render.com → New → Web Service → reponu seç.
3. Ayarlar:
   - Build Command: `npm install`
   - Start Command: `node bot.js`
   - Plan: Free yeterli
4. Environment Variables (Render panelinde "Environment" sekmesi):
   - `TELEGRAM_BOT_TOKEN` = botfather'dan aldığın token
   - `PORT` = 3000 (Render otomatik de ayarlayabilir, dokunmana gerek yok)
5. Deploy'a bas, loglardan "Taner Haber Bot basladi!" yazısını gör.

## 2) Telegram'da Botu Başlatma

1. Telegram'da @tanerhaberalert_bot'u aç.
2. `/start` yaz.
3. Bot sana "✅ Kayıt oldun!" diye cevap verecek. Bundan sonra yeni haber bulunca
   otomatik sana gönderecek.

Komutlar:
- `/start` → bildirimlere abone ol
- `/stop` → bildirimleri durdur
- `/durum` → bot çalışıyor mu, kaç haber görüldü, kaç abone var

## 3) Nasıl Çalışıyor

- Her 20 dakikada bir tüm kaynakları (RSS) kontrol eder.
- Yeni (daha önce görülmemiş) haberleri bulur ve abone olan herkese gönderir.
- İlk açılışta mevcut haberleri SESSİZCE işaretler (eski haberlerle seni boğmaz),
  sadece bundan sonraki YENİ haberleri gönderir.
- Abone listesi ve görülen haber linkleri `/tmp` içinde saklanır — servis yeniden
  başlatılırsa (deploy, uyku modu vb.) bu liste sıfırlanabilir; bu durumda bot bir
  süre eski haberleri tekrar gönderebilir, sorun değil.

## 4) Kaynak Eklemek/Çıkarmak

`bot.js` içindeki `FEEDS` dizisine yeni bir `{ name: '...', url: '...' }` eklemen
yeterli. RSS adresi olmayan bir site eklemek istersen (örn. deutschturkhaber.com gibi
SPA siteler) ayrı bir scraping fonksiyonu yazmamız gerekir — bunun için söyle.

## 5) Notlar

- `Sözcü` RSS adresi (`feeds-rss-category-gundem`) doğrulanmadı; ilk çalıştırmada
  loglarda hata görürsen bana söyle, doğru adresi bulup düzeltirim.
- National Geographic ve ScienceDaily İngilizce — X'te paylaşırken çeviri/özet
  gerekebilir.
