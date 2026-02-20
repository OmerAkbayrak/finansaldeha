# 💱 Kur Savaşları — Multiplayer Online

Türk Lirası, USD, EUR, Altın ve Sterlin arasında strateji oyunu. 2-6 oyuncu, farklı cihazlardan gerçek zamanlı oynayabilir.

---

## 🚀 Yerel Kurulum (Kendi bilgisayarında test)

### 1. Node.js Kur
- https://nodejs.org adresinden LTS sürümü indir ve kur

### 2. Projeyi Başlat
```bash
# Bu klasöre gel
cd kur-savaslari-multiplayer

# Gerekli paketleri kur (sadece ilk seferinde)
npm install

# Sunucuyu başlat
npm start
```

### 3. Tarayıcıda Aç
```
http://localhost:3000
```

Arkadaşın aynı Wi-Fi'deyse:
```
http://SENİN_IP_ADRESİN:3000
```
(IP adresini bulmak için Windows'ta `ipconfig`, Mac/Linux'ta `ifconfig` komutunu kullan)

---

## 🌐 İnternete Yayınlama (Ücretsiz)

### Seçenek A: Railway (En Kolay — Önerilen)
1. https://railway.app — GitHub ile kayıt ol
2. "New Project" → "Deploy from GitHub repo"
3. Bu proje klasörünü GitHub'a yükle (github.com'da yeni repo aç, dosyaları yükle)
4. Railway otomatik algılar ve yayınlar
5. Sana `https://xxx.railway.app` gibi bir URL verir
6. Bu URL'yi arkadaşlarınla paylaş — dünyanın her yerinden oynayabilirsiniz!

### Seçenek B: Render.com (Ücretsiz)
1. https://render.com — GitHub ile kayıt ol
2. "New Web Service" → GitHub reposunu seç
3. Start Command: `npm start`
4. Deploy et — birkaç dakika sonra URL hazır

### Seçenek C: Railway CLI (Terminal üzerinden)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

---

## 📁 Dosya Yapısı

```
kur-savaslari-multiplayer/
├── server.js          ← Node.js sunucusu (oyun mantığı + Socket.io)
├── package.json       ← Bağımlılıklar
├── public/
│   └── index.html     ← Tüm frontend (HTML + CSS + JS)
└── README.md          ← Bu dosya
```

---

## 🎮 Nasıl Oynanır?

1. Bir oyuncu **Oda Oluştur** → 6 haneli kodu arkadaşlarına gönderir
2. Diğerleri **Odaya Katıl** → kodu girer
3. Herkes **Hazırım** der → Oda sahibi **Oyunu Başlat**'a basar
4. Sırayla her oyuncu:
   - **Al/Sat** ile döviz işlemi yapabilir (turda 1 kez)
   - **Takas** ile başka oyuncuyla değiş tokuş yapabilir (turda 1 kez)
   - **Turu Bitir** der → sıra geçer
5. Tüm oyuncular hamlesini yapınca kurlar değişir
6. Hedef kartındaki dövize ulaşan kazanır!

---

## 🛠 Geliştirme (nodemon ile otomatik yenileme)
```bash
npm run dev
```
