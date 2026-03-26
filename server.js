const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*' },
  pingTimeout:  60000,
  pingInterval: 25000,
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/ping', (_, res) => res.send('pong'));

// ── Sabitler ──────────────────────────────────────────────────────────────────
const CURRENCIES      = ['TL','USD','EUR','ALTIN','GUMUS','STERLIN'];
const BOOM_CURRENCIES = ['USD','EUR','ALTIN','GUMUS','STERLIN'];
const TURN_MS         = 60_000;
const CREDIT_AMOUNT   = 10_000;
const CREDIT_ROUNDS   = 2;
const BOOM_CHANCE     = 0.01;
const BOOM_GAIN       = 50;
const BOT_ID          = 'BOT_PLAYER';

// Gerçek piyasa başlangıç kurları
const FALLBACK = { TL:1, USD:44.07, EUR:51.20, ALTIN:7314, GUMUS:120, STERLIN:59.07 };

const BOT_TAUNTS = [
  'EZ',
  'Öğren de gel.',
  'Kolaysın.',
  'Ben robotum ama senden iyiyim bro...',
  'Git kitap falan oku kanka'
];

// EVENTS artık tier bazlı: tier 1 = basit (tur 1-4), tier 2 = orta (tur 5-9), tier 3 = karmaşık (tur 10+)
// Her olay için outcomes: her birimin kendi yönü ve risk aralığı ayrı
// outcomes[birim] = { min, max }  → negatif=düşüş, pozitif=yükseliş (rastgele bu aralıkta)
const EVENTS = [
  // ─── TİER 1: Temel olaylar (basit, 1-2 birim) ────────────────────────────
  { tier:1, name:'Dolar/TL Kuru Yükseldi',
    desc:'Piyasada dolar talebi arttı.',
    outcomes:{ USD:{min:8,max:18}, TL:{min:-5,max:-2} } },
  { tier:1, name:'TL Değer Kazandı',
    desc:'Merkez Bankası faiz kararıyla TL güçlendi.',
    outcomes:{ USD:{min:-12,max:-5}, EUR:{min:-10,max:-4} } },
  { tier:1, name:'Altın Fiyatları Yükseldi',
    desc:'Küresel belirsizlik altına olan ilgiyi artırdı.',
    outcomes:{ ALTIN:{min:6,max:16} } },
  { tier:1, name:'Gümüş Endüstriyel Talebi Arttı',
    desc:'Elektronik sektörü gümüş tüketimini artırdı.',
    outcomes:{ GUMUS:{min:7,max:15}, ALTIN:{min:2,max:8} } },
  { tier:1, name:'Euro Bölgesi Büyüme Verisi Açıklandı',
    desc:'AB beklentileri aştı, Euro güçlendi.',
    outcomes:{ EUR:{min:5,max:14} } },
  { tier:1, name:'İngiltere Faiz Kararı',
    desc:'Bank of England faiz oranını sabit tuttu.',
    outcomes:{ STERLIN:{min:-6,max:10} } },
  { tier:1, name:'Türkiye Turizm Geliri Arttı',
    desc:'Yaz sezonu döviz girişini hızlandırdı.',
    outcomes:{ USD:{min:-5,max:3}, EUR:{min:-4,max:3} } },
  { tier:1, name:'ABD İşsizlik Verisi Açıklandı',
    desc:'İşsizlik oranı beklentinin altında kaldı.',
    outcomes:{ USD:{min:3,max:12} } },
  { tier:1, name:'Petrol Fiyatları Hafif Düştü',
    desc:'OPEC üretim kararı piyasaları sakinleştirdi.',
    outcomes:{ USD:{min:-4,max:6}, EUR:{min:-3,max:5} } },
  { tier:1, name:'Türkiye İhracat Rakamları Açıklandı',
    desc:'İhracat artışı döviz rezervlerini güçlendirdi.',
    outcomes:{ USD:{min:-8,max:2}, EUR:{min:-7,max:2} } },

  // ─── TİER 2: Orta düzey (2-3 birim, belirsiz sonuçlar) ───────────────────
  { tier:2, name:'Fed Faiz Kararı Açıklandı',
    desc:'Federal Reserve faiz kararı piyasalarda karışık etki yarattı.',
    outcomes:{ USD:{min:-10,max:18}, ALTIN:{min:-12,max:15}, EUR:{min:-8,max:10} } },
  { tier:2, name:'Çin Büyüme Beklentisi Güncellendi',
    desc:'Çin büyüme rakamları hem metal hem dolar piyasalarını sarstı.',
    outcomes:{ ALTIN:{min:-8,max:14}, GUMUS:{min:-6,max:12}, USD:{min:-5,max:8} } },
  { tier:2, name:'Avrupa Merkez Bankası Kararı',
    desc:'ECB\'nin açıklaması hem euronun hem İngiliz sterlinin seyrini değiştirdi.',
    outcomes:{ EUR:{min:-15,max:15}, STERLIN:{min:-10,max:12} } },
  { tier:2, name:'Türkiye Merkez Bankası Olağanüstü Toplantısı',
    desc:'Olağanüstü faiz kararı döviz kurlarında ani hareketlere neden oldu.',
    outcomes:{ USD:{min:-18,max:20}, EUR:{min:-16,max:18}, STERLIN:{min:-12,max:14} } },
  { tier:2, name:'Altın Madeni Grevi',
    desc:'Güney Afrika\'daki grev altın arzını etkiledi, gümüş de bağımlılık nedeniyle dalgalandı.',
    outcomes:{ ALTIN:{min:5,max:20}, GUMUS:{min:-5,max:15} } },
  { tier:2, name:'ABD Enflasyon Verisi Sürpriz Yaptı',
    desc:'Beklentilerin üzerinde gelen enflasyon dolar ve altını ters yönlerde etkiledi.',
    outcomes:{ USD:{min:-15,max:12}, ALTIN:{min:-8,max:18} } },
  { tier:2, name:'İngiltere Brexit Sonrası Anlaşma',
    desc:'Yeni ticaret anlaşması sterlin ve euroda farklı etkiler doğurdu.',
    outcomes:{ STERLIN:{min:-12,max:18}, EUR:{min:-8,max:10} } },
  { tier:2, name:'Küresel Çip Krizi Tırmandı',
    desc:'Yarı iletken darboğazı endüstriyel metallere olan talebi dönüştürdü.',
    outcomes:{ GUMUS:{min:8,max:20}, ALTIN:{min:-5,max:10}, USD:{min:-4,max:8} } },
  { tier:2, name:'OPEC Toplantısı Sonuçsuz Kaldı',
    desc:'Anlaşmazlık petrol fiyatlarını ve dolara bağlı varlıkları sarstı.',
    outcomes:{ USD:{min:-10,max:10}, ALTIN:{min:-6,max:14}, EUR:{min:-5,max:8} } },
  { tier:2, name:'Japonya Yeni Politika Açıkladı',
    desc:'BOJ\'un yeni para politikası küresel döviz dengesini bozdu.',
    outcomes:{ USD:{min:-8,max:14}, EUR:{min:-6,max:10}, STERLIN:{min:-5,max:9} } },
  { tier:2, name:'Türkiye Seçim Süreci Başladı',
    desc:'Siyasi belirsizlik döviz kurlarını ve güvenli liman varlıklarını etkiledi.',
    outcomes:{ USD:{min:5,max:18}, EUR:{min:4,max:14}, ALTIN:{min:3,max:12} } },
  { tier:2, name:'Rusya Doğalgaz Akışını Kıstı',
    desc:'Avrupa\'ya gaz akışının azalması enerji krizine yol açtı.',
    outcomes:{ EUR:{min:-15,max:-3}, STERLIN:{min:-10,max:-2}, ALTIN:{min:5,max:18} } },
  { tier:2, name:'IMF Küresel Tahminleri Revize Etti',
    desc:'Büyüme tahminlerindeki değişim farklı varlıkları farklı yönlerde etkiledi.',
    outcomes:{ USD:{min:-8,max:12}, EUR:{min:-6,max:10}, ALTIN:{min:-5,max:8}, GUMUS:{min:-4,max:7} } },

  // ─── TİER 3: Karmaşık (4+ birim, yüksek risk, beklenmedik sonuçlar) ───────
  { tier:3, name:'Küresel Finansal Kriz Sinyalleri',
    desc:'Büyük bankalardan gelen stres testleri piyasalarda panik yarattı. Her varlık kendi dinamiğiyle hareket etti.',
    outcomes:{ USD:{min:-20,max:25}, EUR:{min:-18,max:15}, ALTIN:{min:-10,max:30}, GUMUS:{min:-15,max:20}, STERLIN:{min:-20,max:12} } },
  { tier:3, name:'Çin-ABD Ticaret Savaşı Tırmandı',
    desc:'Yeni tarifeler tüm varlık sınıflarını sarstı; kazanan ve kaybeden tahmin edilemez oldu.',
    outcomes:{ USD:{min:-18,max:20}, EUR:{min:-12,max:14}, ALTIN:{min:-8,max:25}, GUMUS:{min:-10,max:18}, STERLIN:{min:-10,max:12} } },
  { tier:3, name:'Orta Doğu\'da Büyük Çatışma',
    desc:'Bölgesel istikrarsızlık petrol fiyatlarını vurdu, güvenli liman arayışı karmaşık sonuçlar doğurdu.',
    outcomes:{ USD:{min:5,max:22}, ALTIN:{min:8,max:28}, GUMUS:{min:3,max:16}, EUR:{min:-15,max:5}, STERLIN:{min:-12,max:4} } },
  { tier:3, name:'Küresel Salgın Uyarısı',
    desc:'DSÖ acil durum ilan etti. Piyasalar çılgına döndü; her birim kendi stres dinamiğiyle hareket etti.',
    outcomes:{ USD:{min:-15,max:25}, EUR:{min:-20,max:10}, ALTIN:{min:10,max:35}, GUMUS:{min:-12,max:20}, STERLIN:{min:-18,max:8} } },
  { tier:3, name:'Büyük Merkez Bankası Koordinasyonu',
    desc:'G7 merkez bankaları eş zamanlı karar aldı. Etkileri birbirini hem güçlendirdi hem kesti.',
    outcomes:{ USD:{min:-20,max:20}, EUR:{min:-15,max:18}, STERLIN:{min:-14,max:16}, ALTIN:{min:-18,max:22}, GUMUS:{min:-12,max:16} } },
  { tier:3, name:'Yapay Zeka Hisse Balonu Patladı',
    desc:'Tech sektöründeki çöküş kıymetli metallere kaçışa yol açtı ama dövizler karmaşık tepkiler verdi.',
    outcomes:{ ALTIN:{min:15,max:35}, GUMUS:{min:10,max:25}, USD:{min:-15,max:10}, EUR:{min:-10,max:8}, STERLIN:{min:-8,max:10} } },
  { tier:3, name:'Küresel Enerji Dönüşüm Krizi',
    desc:'Fosil yakıt kısıtlamaları ve yenilenebilir enerji geçiş sorunları her piyasayı ayrı vurdu.',
    outcomes:{ EUR:{min:-18,max:10}, STERLIN:{min:-15,max:8}, GUMUS:{min:8,max:25}, ALTIN:{min:5,max:18}, USD:{min:-8,max:15} } },
  { tier:3, name:'Çoklu Ülke Borç Krizi',
    desc:'Üç gelişmekte olan ülkenin eş zamanlı temerrüdü domino etkisi yarattı.',
    outcomes:{ USD:{min:10,max:28}, ALTIN:{min:8,max:25}, EUR:{min:-20,max:-5}, STERLIN:{min:-18,max:-3}, GUMUS:{min:-10,max:15} } },
  { tier:3, name:'Siber Saldırı: Küresel Finans Sistemi',
    desc:'Büyük borsalar ve SWIFT sistemine saldırı tüm piyasaları felç etti.',
    outcomes:{ USD:{min:-25,max:30}, EUR:{min:-20,max:15}, ALTIN:{min:15,max:40}, GUMUS:{min:10,max:28}, STERLIN:{min:-18,max:12} } },
];

// Tur bazlı olay seçimi
function getEventsForRound(round) {
  if (round <= 4)  return EVENTS.filter(e => e.tier === 1);
  if (round <= 9)  return EVENTS.filter(e => e.tier <= 2);
  return EVENTS; // 10+ tüm tier'lar
}


const rooms = {};

// ── Yardımcılar ───────────────────────────────────────────────────────────────
function genCode() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = ''; for (let i = 0; i < 6; i++) c += ch[Math.floor(Math.random() * ch.length)];
  return rooms[c] ? genCode() : c;
}
function makeStarting() {
  const c = CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)];
  const r = { TL:[12000,30000], USD:[300,750], EUR:[270,680], ALTIN:[2,6], GUMUS:[150,450], STERLIN:[230,600] };
  const [mn, mx] = r[c];
  return { currency:c, amount: Math.floor(Math.random() * (mx - mn)) + mn };
}
function makeGoal(sc, sa, rates) {
  const tlVal = sa * (rates[sc] || 1);
  const mult  = 1.5 + Math.random(); // 1.5x–2.5x
  const target = tlVal * mult;
  const opts = CURRENCIES.filter(c => c !== sc);
  const c = opts[Math.floor(Math.random() * opts.length)];
  return { currency:c, amount: Math.round((target / (rates[c] || 1)) * 100) / 100 };
}
function bySocket(sid) {
  return Object.values(rooms).find(r => r.players.some(p => p.socketId === sid));
}
function portfolioTL(h, rates) {
  return CURRENCIES.reduce((s, c) => s + (h[c] || 0) * (rates[c] || 1), 0);
}
function won(player, rates) {
  return (player.holdings[player.goalCard.currency] || 0) >= player.goalCard.amount;
}
function newPlayer(sid, name, isHost, rates, isBot = false) {
  const st = makeStarting();
  const gl = makeGoal(st.currency, st.amount, rates);
  return {
    socketId: sid, name, ready: false, isHost, isBot,
    startingCard: st, goalCard: gl,
    holdings: Object.fromEntries(CURRENCIES.map(c => [c, c === st.currency ? st.amount : 0])),
    finished: false, eliminated: false, finishRound: null,
    madeTransaction: false, usedCredit: false, creditDueRound: null, portfolioHistory: [],
    txLog: [],         // { round, spentRatio, gainedCurrency } işlem kayıtları
    noTxStreak: 0,     // art arda işlemsiz tur sayısı
    adviceHistory: [], // birikmiş tavsiyeler
  };
}

// ── Kick ─────────────────────────────────────────────────────────────────────
function kickPlayer(room, targetName, kickerName) {
  const gs = room.gameState;
  const idx = room.players.findIndex(p => p.name.toLowerCase() === targetName.toLowerCase() && !p.finished);
  if (idx === -1) return false;
  const p = room.players[idx];
  if (p.isBot) return false;
  p.finished = true; p.eliminated = true; p.finishRound = gs?.round || 0;
  if (gs?.pendingPlayers) gs.pendingPlayers.delete(idx);
  io.to(room.code).emit('chatMsg', { name:'🔨 Sistem', msg:`🚫 ${p.name} oyundan atıldı! (${kickerName} tarafından)` });
  io.to(room.code).emit('playerEliminated', { playerName:p.name, reason:'Oyundan atıldı!' });
  const active = room.players.filter(q => !q.finished);
  if (active.length <= 1) {
    if (active.length === 1) { active[0].finished = true; active[0].finishRound = gs?.round || 0; }
    finishGame(room); return true;
  }
  if (gs && room.players[gs.curIdx]?.socketId === p.socketId) endTurn(room);
  else broadcast(room);
  return true;
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function clearTmr(room) {
  if (room._tmr) { clearTimeout(room._tmr); room._tmr = null; }
  room._tmrStart = null;
}
function startTmr(room) {
  clearTmr(room);
  room._tmrStart = Date.now();
  room._tmr = setTimeout(() => {
    if (!room.gameState || room.status !== 'playing') return;
    const cp = room.players[room.gameState.curIdx];
    io.to(room.code).emit('chatMsg', { name:'⏰ Sistem', msg:`${cp?.name || '?'} süreyi aştı, sıra geçiyor...` });
    endTurn(room);
  }, TURN_MS);
}

// ── Olay ──────────────────────────────────────────────────────────────────────
function drawEvent(room) {
  const gs     = room.gameState;
  const pool   = getEventsForRound(gs.round);
  const ev     = pool[Math.floor(Math.random() * pool.length)];
  gs.event     = ev;
  gs.pending   = {};
  // Her birimin kendi min/max aralığından rastgele değer üret
  Object.entries(ev.outcomes).forEach(([c, range]) => {
    if (c === 'TL') return;
    const { min, max } = range;
    gs.pending[c] = min + Math.random() * (max - min);
  });
  // affected listesini outcomes anahtarlarından türet (eski uyumluluk için)
  gs.event = { ...ev, affected: Object.keys(ev.outcomes).filter(c => c !== 'TL') };
}

// ── Kurlar + BOOM ─────────────────────────────────────────────────────────────
function applyRates(room) {
  const gs = room.gameState;
  gs.lastChanges = {}; gs.changeLog = [];

  Object.entries(gs.pending || {}).forEach(([c, pct]) => {
    if (c === 'TL') return;
    const old = gs.rates[c];
    const nv = Math.max(0.01, Math.round(old * (1 + pct / 100) * 100) / 100);
    gs.rates[c] = nv;
    gs.lastChanges[c] = pct;
    gs.changeLog.push({ currency:c, old, new:nv, change:pct });
  });
  gs.pending = null;

  // forcedBoom veya %1 rastgele BOOM
  let boomCurrency = null;
  if (gs.forcedBoom && BOOM_CURRENCIES.includes(gs.forcedBoom)) {
    boomCurrency = gs.forcedBoom;
    gs.forcedBoom = null;
  } else if (Math.random() < BOOM_CHANCE) {
    boomCurrency = BOOM_CURRENCIES[Math.floor(Math.random() * BOOM_CURRENCIES.length)];
  }

  let boom = null;
  if (boomCurrency) {
    const old = gs.rates[boomCurrency];
    const nv  = Math.round(old * (1 + BOOM_GAIN / 100) * 100) / 100;
    gs.rates[boomCurrency] = nv;
    gs.lastChanges[boomCurrency] = (gs.lastChanges[boomCurrency] || 0) + BOOM_GAIN;
    boom = { currency:boomCurrency, oldVal:old, newVal:nv };
    io.to(room.code).emit('chatMsg', {
      name:'🚀 Sistem',
      msg:`🚀💥 AŞIRI YÜKSELİŞ! ${boomCurrency} %${BOOM_GAIN} değer kazandı! (${old.toFixed(2)} → ${nv.toFixed(2)} ₺)`
    });
  }

  snapRates(room);
  io.to(room.code).emit('ratesApplied', { event:gs.event, changeLog:gs.changeLog, rates:{...gs.rates}, lastChanges:{...gs.lastChanges} });
  if (boom) io.to(room.code).emit('boom', boom);
}

function snapRates(room) {
  const gs = room.gameState; if (!gs.rateHistory) gs.rateHistory = {};
  CURRENCIES.forEach(c => {
    if (!gs.rateHistory[c]) gs.rateHistory[c] = [];
    gs.rateHistory[c].push({ round:gs.round, value:gs.rates[c] });
  });
}
function snapPortfolio(room) {
  const gs = room.gameState;
  room.players.forEach(p => { if (!p.finished) p.portfolioHistory.push({ round:gs.round, value:portfolioTL(p.holdings, gs.rates) }); });
}

// ── Kredi ─────────────────────────────────────────────────────────────────────
function checkCredits(room) {
  const gs = room.gameState;
  room.players.forEach(p => {
    if (p.finished || !p.creditDueRound || gs.round < p.creditDueRound) return;
    const total = portfolioTL(p.holdings, gs.rates);
    if (total < CREDIT_AMOUNT) {
      p.eliminated = p.finished = true; p.finishRound = gs.round;
      io.to(room.code).emit('playerEliminated', { playerName:p.name, reason:'Kredi borcunu ödeyemedi!' });
      io.to(room.code).emit('chatMsg', { name:'🏦 Sistem', msg:`💀 ${p.name} kredi borcunu ödeyemedi!` });
    } else {
      let rem = CREDIT_AMOUNT;
      const tlD = Math.min(p.holdings.TL || 0, rem); p.holdings.TL = (p.holdings.TL || 0) - tlD; rem -= tlD;
      for (const c of ['USD','EUR','STERLIN','ALTIN','GUMUS']) {
        if (rem <= 0) break;
        const d = Math.min(p.holdings[c] || 0, rem / (gs.rates[c] || 1));
        p.holdings[c] = (p.holdings[c] || 0) - d; rem -= d * (gs.rates[c] || 1);
      }
      p.creditDueRound = null;
      io.to(room.code).emit('chatMsg', { name:'🏦 Sistem', msg:`✅ ${p.name} kredisini geri ödedi.` });
    }
  });
}

// ── Oyun sonu ─────────────────────────────────────────────────────────────────
function finishGame(room) {
  clearTmr(room); room._locked = false; room.status = 'finished';
  const gs = room.gameState;
  const ranked = [...room.players].sort((a, b) => {
    const aw = a.finished && !a.eliminated, bw = b.finished && !b.eliminated;
    if (aw && bw) return a.finishRound - b.finishRound;
    if (aw) return -1; if (bw) return 1;
    if (a.eliminated && !b.eliminated) return 1;
    if (!a.eliminated && b.eliminated) return -1;
    return portfolioTL(b.holdings, gs.rates) - portfolioTL(a.holdings, gs.rates);
  });
  io.to(room.code).emit('gameOver', { ranking:ranked, rates:gs.rates });
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
function broadcast(room) {
  const gs = room.gameState; if (!gs) return;
  const cp  = room.players[gs.curIdx];
  const rem = room._tmrStart ? Math.max(0, TURN_MS - (Date.now() - room._tmrStart)) : TURN_MS;
  room.players.forEach(p => {
    if (p.isBot) return;
    const sock = io.sockets.sockets.get(p.socketId); if (!sock) return;
    sock.emit('gameState', {
      round: gs.round, rates: {...gs.rates}, lastChanges: gs.lastChanges || {},
      event: gs.event, pending: gs.pending ? {...gs.pending} : null,
      curSid: cp?.socketId, curName: cp?.name,
      isMyTurn: p.socketId === cp?.socketId, timerMs: rem,
      rateHistory: gs.rateHistory || {},
      players: room.players.map(q => ({
        socketId: q.socketId, name: q.name, isBot: q.isBot || false, avatarId: q.avatarId||1, avatarImg: q.avatarImg||'',
        finished: q.finished, eliminated: q.eliminated || false, finishRound: q.finishRound,
        holdings: {...q.holdings}, goalCard: q.goalCard, startingCard: q.startingCard,
        madeTransaction: q.madeTransaction, usedCredit: q.usedCredit,
        creditDueRound: q.creditDueRound, portfolioHistory: q.portfolioHistory,
      })),
      myPlayer: {...p, holdings: {...p.holdings}},
    });
  });
}

// ── Bot Hamlesi ───────────────────────────────────────────────────────────────
function doBotTurn(room) {
  const gs = room.gameState; if (!gs || room.status !== 'playing') return;
  const bot = room.players[gs.curIdx]; if (!bot || !bot.isBot) return;

  const goalC   = bot.goalCard.currency;
  const goalAmt = bot.goalCard.amount;

  // ① Tüm varlıkları goalC'ye çevirsek hedefi karşılar mıyız?
  const totalIfConverted = CURRENCIES.reduce((sum, c) => {
    if (c === goalC) return sum + (bot.holdings[c] || 0);
    const tlVal = (bot.holdings[c] || 0) * (gs.rates[c] || 1);
    return sum + tlVal / (gs.rates[goalC] || 1);
  }, 0);

  if (totalIfConverted >= goalAmt) {
    // Kazanabilir — goalC dışındaki tüm varlıkları goalC'ye çevir
    CURRENCIES.forEach(c => {
      if (c === goalC || (bot.holdings[c] || 0) < 0.0001) return;
      const payAmt = bot.holdings[c];
      const getAmt = (payAmt * (gs.rates[c] || 1)) / (gs.rates[goalC] || 1);
      bot.holdings[c]    = 0;
      bot.holdings[goalC] = (bot.holdings[goalC] || 0) + getAmt;
    });
    bot.madeTransaction = true;
    io.to(room.code).emit('chatMsg', { name:'🤖 Sistem', msg:`🤖 ${bot.name} tüm varlığını ${goalC} birimine çevirdi!` });

    if (won(bot, gs.rates)) {
      bot.finished = true; bot.finishRound = gs.round;
      const rank = room.players.filter(p => p.finished && !p.eliminated).length;
      io.to(room.code).emit('playerFinished', { playerName:bot.name, rank });
      io.to(room.code).emit('chatMsg', { name:'🏆 Sistem', msg:`🥇 ${bot.name} hedefine ulaştı! (${rank}. sıra)` });
      const active = room.players.filter(p => !p.finished);
      if (active.length <= 1) {
        if (active.length === 1) { active[0].finished = true; active[0].finishRound = gs.round; }
        finishGame(room); return;
      }
      endTurn(room); return;
    }
    // Won kontrolünden geçemediyse (kayan virgül farkı) yine de turu bitir
    const delay = 1500 + Math.random() * 1500;
    setTimeout(() => { if (room.status === 'playing' && room.players[gs.curIdx]?.isBot) endTurn(room); }, delay);
    return;
  }

  // ② Normal tur: olay bazlı akıllı yatırım
  const event    = gs.event;
  const affected = event?.affected || [];
  const pending  = gs.pending || {};

  // En iyi alım hedefini belirle:
  // Öncelik 1: goalC olaydan etkileniyorsa ve pozitif beklentisi varsa → goalC al
  // Öncelik 2: Olaydan etkilenen birimlerden en yüksek pozitif beklentisi olan → onu al (sonra goalC'ye çevrilir)
  // Öncelik 3: Olay yok veya tümü negatif → direkt goalC al
  let bestBuy   = null;
  let bestScore = -Infinity;

  if (affected.includes(goalC) && (pending[goalC] || 0) > 0) {
    bestBuy = goalC;
  } else {
    for (const c of affected) {
      if (c === 'TL') continue;
      const score = pending[c] || 0;
      if (score > bestScore) { bestScore = score; bestBuy = c; }
    }
    if (!bestBuy || bestScore <= 0) bestBuy = goalC;
  }

  // Ödeme birimi: bestBuy dışında en yüksek TL değerine sahip holding
  // (goalC ise bestBuy=goalC, onu ödeme olarak kullanmamak için goalC de hariç tut)
  let bestPay = null, bestPayTL = 0;
  CURRENCIES.forEach(c => {
    if (c === bestBuy) return;
    const v = (bot.holdings[c] || 0) * (gs.rates[c] || 1);
    if (v > bestPayTL) { bestPayTL = v; bestPay = c; }
  });

  if (bestPay && bestPayTL > 100 && (gs.rates[bestBuy] || 0) > 0) {
    const ratio  = bestBuy === goalC ? 0.85 : 0.65;
    const payAmt = (bot.holdings[bestPay] || 0) * ratio;
    const getAmt = (payAmt * (gs.rates[bestPay] || 1)) / (gs.rates[bestBuy] || 1);
    if (payAmt > 0.0001 && getAmt > 0.0001) {
      bot.holdings[bestPay] = (bot.holdings[bestPay] || 0) - payAmt;
      bot.holdings[bestBuy] = (bot.holdings[bestBuy] || 0) + getAmt;
      bot.madeTransaction   = true;
      io.to(room.code).emit('chatMsg', {
        name:'🤖 Sistem',
        msg:`🤖 ${bot.name} ${payAmt.toFixed(2)} ${bestPay} → ${getAmt.toFixed(2)} ${bestBuy} yatırımı yaptı.`
      });

      if (won(bot, gs.rates)) {
        bot.finished = true; bot.finishRound = gs.round;
        const rank = room.players.filter(p => p.finished && !p.eliminated).length;
        io.to(room.code).emit('playerFinished', { playerName:bot.name, rank });
        io.to(room.code).emit('chatMsg', { name:'🏆 Sistem', msg:`🥇 ${bot.name} hedefine ulaştı! (${rank}. sıra)` });
        const active = room.players.filter(p => !p.finished);
        if (active.length <= 1) {
          if (active.length === 1) { active[0].finished = true; active[0].finishRound = gs.round; }
          finishGame(room); return;
        }
        endTurn(room); return;
      }
    }
  }

  const delay = 2500 + Math.random() * 4000;
  setTimeout(() => {
    if (room.status === 'playing' && room.players[gs.curIdx]?.isBot) endTurn(room);
  }, delay);
}

// ── Tur sonu oyuncu analizi & tavsiye ────────────────────────────────────────
/*
  Her round sonunda insan oyuncular için 3 kural kontrol edilir:
  A) Düşük yatırım oranı   → portfolyonun %10'undan az harcadı  (son 3 turda)
  B) Yüksek yatırım oranı  → portfolyonun %80'inden fazla harcadı (son 3 turda)
  C) Pasif strateji         → art arda 5 tur işlem yapmadı
*/
function analyzeTurnForPlayer(p, gs) {
  if (p.isBot || p.finished) return [];
  const tips = [];
  const totalTL = portfolioTL(p.holdings, gs.rates);

  // noTxStreak güncelle
  if (p.madeTransaction) {
    p.noTxStreak = 0;
  } else {
    p.noTxStreak = (p.noTxStreak || 0) + 1;
  }

  // A) Düşük yatırım oranı: Son 3 turda ortalaması çok düşük mü?
  const recent = (p.txLog || []).slice(-3);
  if (recent.length >= 1 && p.madeTransaction) {
    const avgRatio = recent.reduce((s, t) => s + t.spentRatio, 0) / recent.length;
    if (avgRatio < 0.08) {
      tips.push({
        type: 'low_investment',
        icon: '📉',
        title: 'Yatırım Miktarın Düşük',
        msg: `Portföyünün yalnızca %${(avgRatio*100).toFixed(0)}'ini yatırıma ayırdın. Piyasa yükseli eğilimindeyken daha büyük hamleler daha fazla kâr getirebilir.`,
        tip: `💡 Portföyünün %20–50'sini yatırıma ayırmayı dene.`,
      });
    }
  }

  // B) Yüksek yatırım oranı: Son 3 turda ortalama %80'den fazla harcıyorsa
  if (recent.length >= 2 && p.madeTransaction) {
    const avgRatio = recent.reduce((s, t) => s + t.spentRatio, 0) / recent.length;
    if (avgRatio > 0.80) {
      tips.push({
        type: 'high_investment',
        icon: '⚠️',
        title: 'Riskli Büyük Yatırımlar',
        msg: `Son turlarda portföyünün %${(avgRatio*100).toFixed(0)}'ini tek hamlede harcıyorsun. Piyasa tersine dönerse büyük zarar edebilirsin.`,
        tip: `💡 Her hamlende portföyünün %30–50'sini yatırmayı dene; bir kısmı likid kalsın.`,
      });
    }
  }

  // C) 5 tur art arda pasif
  if ((p.noTxStreak || 0) >= 5) {
    tips.push({
      type: 'passive',
      icon: '⏳',
      title: 'Çok Pasif Strateji',
      msg: `${p.noTxStreak} tur boyunca hiç işlem yapmadın. Fırsatlar kaçıyor olabilir.`,
      tip: `💡 Her tur mutlaka işlem yapmak şart değil; ama olay kartlarını takip et ve fırsatlar çıktığında harekete geç.`,
    });
  }

  // Tavsiye geçmişine ekle
  if (!p.adviceHistory) p.adviceHistory = [];
  tips.forEach(t => p.adviceHistory.push({ round: gs.round, ...t }));
  // Maksimum 20 tavsiye tut
  if (p.adviceHistory.length > 20) p.adviceHistory = p.adviceHistory.slice(-20);

  return tips;
}

// ── Analizleri gönder (her round sonunda) ──────────────────────────────────────
function sendRoundAdvice(room) {
  const gs = room.gameState;
  room.players.forEach(p => {
    if (p.isBot || p.finished) return;
    const tips = analyzeTurnForPlayer(p, gs);
    const sock = io.sockets.sockets.get(p.socketId); if (!sock) return;
    // Her turda tavsiye geçmişinin tamamını gönder (portföy modal için)
    sock.emit('playerAdvice', {
      round: gs.round,
      newTips: tips,
      allAdvice: p.adviceHistory || [],
    });
  });
}

// ── Bot hakareti: kullanıcı zarar edecek birime yatırım yaptıysa ──────────────
function botTauntIfHurt(room, boughtCurrency) {
  // pending: şu an tur sonunda uygulanacak değişimler
  const gs = room.gameState; if (!gs) return;
  const bot = room.players.find(p => p.isBot);
  if (!bot || bot.finished) return;
  // Olay olayın pending'inde bu birim var ve değer düşüyor mu?
  const pendingChg = gs.pending?.[boughtCurrency];
  if (pendingChg !== undefined && pendingChg < -5) {
    const taunt = BOT_TAUNTS[Math.floor(Math.random() * BOT_TAUNTS.length)];
    setTimeout(() => {
      if (room.status === 'playing')
        io.to(room.code).emit('chatMsg', { name:'🤖 KurBot', msg: taunt });
    }, 1200 + Math.random() * 1500);
  }
}

// ── Tur bitişi ────────────────────────────────────────────────────────────────
function endTurn(room) {
  if (room._locked) return;
  room._locked = true; clearTmr(room);
  const gs = room.gameState;
  if (!gs || room.status !== 'playing') { room._locked = false; return; }
  const curIdx = gs.curIdx;
  gs.pendingPlayers.delete(curIdx);

  if (gs.pendingPlayers.size === 0) {
    // ── Round sonu ──────────────────────────────────────────────────────────
    gs.round++;
    applyRates(room); checkCredits(room); snapPortfolio(room);
    // Tur sonu tavsiye analizi (applyRates ve snapPortfolio sonrası, madeTransaction hâlâ set)
    sendRoundAdvice(room);
    const active = room.players.filter(p => !p.finished);
    if (active.length <= 1) {
      if (active.length === 1) { active[0].finished = true; active[0].finishRound = gs.round; }
      room._locked = false; finishGame(room); return;
    }
    drawEvent(room);
    const firstIdx = room.players.findIndex(p => !p.finished);
    gs.pendingPlayers = new Set(room.players.map((_, i) => i).filter(i => !room.players[i].finished));
    gs.curIdx = firstIdx; room.players[firstIdx].madeTransaction = false;
    room._locked = false; broadcast(room);
    if (room.players[firstIdx].isBot) doBotTurn(room);
    else startTmr(room);
    return;
  }
  // ── Aynı round içinde sıra geçişi ──────────────────────────────────────────
  const remaining = [...gs.pendingPlayers].sort((a, b) => a - b);
  const nxt = remaining.find(i => i > curIdx) ?? remaining[0];
  gs.curIdx = nxt; room.players[nxt].madeTransaction = false;
  room._locked = false; broadcast(room);
  if (room.players[nxt].isBot) doBotTurn(room);
  else startTmr(room);
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[+] ${socket.id}`);

  socket.on('createRoom', ({ name, avatarId, avatarName, avatarImg }) => {
    const code = genCode();
    rooms[code] = { code, host:socket.id, players:[], gameState:null, status:'lobby', _tmr:null, _tmrStart:null, _locked:false };
    const p = newPlayer(socket.id, name, true, FALLBACK);
    p.avatarId=avatarId||1; p.avatarName=avatarName||''; p.avatarImg=avatarImg||'';
    rooms[code].players.push(p); socket.join(code);
    socket.emit('roomCreated', { code, player:p });
  });

  socket.on('startSolo', ({ name, avatarId, avatarName, avatarImg }) => {
    const code = genCode();
    rooms[code] = { code, host:socket.id, players:[], gameState:null, status:'lobby', _tmr:null, _tmrStart:null, _locked:false };
    const p   = newPlayer(socket.id, name, true, FALLBACK); p.ready = true;
    p.avatarId=avatarId||1; p.avatarName=avatarName||''; p.avatarImg=avatarImg||'';
    const bot = newPlayer(BOT_ID, '🤖 KurBot', false, FALLBACK, true); bot.ready = true;
    rooms[code].players.push(p, bot); socket.join(code);
    socket.emit('roomCreated', { code, player:p, isSolo:true });
    socket.emit('lobbyReady',  { isSolo:true });
  });

  socket.on('joinRoom', ({ code, name, avatarId, avatarName, avatarImg }) => {
    const room = rooms[code.toUpperCase()];
    if (!room)                   return socket.emit('error', 'Oda bulunamadı!');
    if (room.status !== 'lobby') return socket.emit('error', 'Oyun zaten başladı!');
    if (room.players.length >= 6) return socket.emit('error', 'Oda dolu!');
    const p = newPlayer(socket.id, name, false, FALLBACK);
    p.avatarId=avatarId||1; p.avatarName=avatarName||''; p.avatarImg=avatarImg||'';
    room.players.push(p); socket.join(code.toUpperCase());
    socket.emit('joinedRoom', { code:code.toUpperCase(), player:p, players:room.players });
    io.to(code.toUpperCase()).emit('playerJoined', { players:room.players });
    io.to(code.toUpperCase()).emit('chatMsg', { name:'🎮 Sistem', msg:`${name} lobiye katıldı!` });
  });

  socket.on('rejoin', ({ code, name }) => {
    const room = rooms[code]; if (!room) return;
    const p = room.players.find(q => q.name === name && !q.isBot); if (!p) return;
    const old = p.socketId;
    p.socketId = socket.id; socket.join(code);
    if (room.host === old) room.host = socket.id;
    if (room.status === 'playing') broadcast(room);
    else io.to(code).emit('playerJoined', { players:room.players });
    socket.emit('rejoinOk', { code, room_status:room.status });
    console.log(`[REJOIN] ${name} → ${socket.id}`);
  });

  socket.on('setReady', ({ ready }) => {
    const room = bySocket(socket.id); if (!room) return;
    const p = room.players.find(q => q.socketId === socket.id); if (p) p.ready = ready;
    io.to(room.code).emit('playerJoined', { players:room.players });
  });

  socket.on('chat', ({ msg }) => {
    const room = bySocket(socket.id); if (!room) return;
    const p = room.players.find(q => q.socketId === socket.id); if (!p) return;
    const txt = String(msg).slice(0, 150).trim(); if (!txt) return;
    const lower = txt.toLowerCase();

    // Gizli komutlar
    if (lower === '/omer') {
      socket.emit('openGivePanel', { players: room.players.filter(q => !q.isBot).map(q => ({ socketId:q.socketId, name:q.name })) });
      return;
    }
    if (lower.startsWith('/turker ') || lower.startsWith('/bulut ')) {
      if (room.status !== 'playing') return socket.emit('error', 'Oyun başlamadan kullanılamaz!');
      const targetName = txt.slice(txt.indexOf(' ') + 1).trim();
      const ok = kickPlayer(room, targetName, p.name);
      if (!ok) socket.emit('error', `"${targetName}" bulunamadı veya zaten bitirdi!`);
      return;
    }
    if (lower.startsWith('/boom ')) {
      if (room.status !== 'playing') return socket.emit('error', 'Oyun başlamadan kullanılamaz!');
      const bc = txt.slice(6).trim().toUpperCase();
      const validMap = { 'USD':'USD', 'EUR':'EUR', 'ALTIN':'ALTIN', 'GUMUS':'GUMUS', 'GÜMÜŞ':'GUMUS', 'STERLIN':'STERLIN' };
      const mapped = validMap[bc];
      if (!mapped) return socket.emit('error', 'Geçersiz birim! (USD, EUR, ALTIN, GUMUS, STERLIN)');
      room.gameState.forcedBoom = mapped;
      socket.emit('chatMsg', { name:'🔧 Sistem', msg:`✅ Bir sonraki tur sonunda ${mapped} BOOM yaşayacak.` });
      return;
    }

    io.to(room.code).emit('chatMsg', { name:p.name, msg:txt, avatarImg:p.avatarImg||'' });
  });

  socket.on('adminGive', ({ targetSocketId, currency, amount }) => {
    const room = bySocket(socket.id); if (!room || room.status !== 'playing') return;
    if (!CURRENCIES.includes(currency)) return;
    const amt = Number(amount); if (!amt || amt <= 0 || amt > 9_999_999) return;
    const target = room.players.find(q => q.socketId === targetSocketId);
    if (!target) return socket.emit('error', 'Oyuncu bulunamadı!');
    target.holdings[currency] = (target.holdings[currency] || 0) + amt;
    socket.emit('giveOk', { targetName:target.name, currency, amount:amt });
    io.to(room.code).emit('chatMsg', { name:'💰 Sistem', msg:`${target.name} hesabına ${amt.toLocaleString('tr-TR')} ${currency} eklendi.` });
    broadcast(room);
  });

  socket.on('startGame', async () => {
    const room = bySocket(socket.id); if (!room) return;
    if (room.host !== socket.id) return socket.emit('error', 'Sadece oda sahibi başlatabilir!');
    if (room.players.filter(p => !p.isBot).length < 1) return socket.emit('error', 'En az 1 insan oyuncu gerekli!');
    if (room.players.length < 2) return socket.emit('error', 'En az 2 oyuncu gerekli!');

    let rates = { ...FALLBACK };
    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/TRY', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const d = await res.json();
        rates.USD     = Math.round((1 / d.rates.USD) * 100) / 100;
        rates.EUR     = Math.round((1 / d.rates.EUR) * 100) / 100;
        rates.STERLIN = Math.round((1 / d.rates.GBP) * 100) / 100;
      }
      rates.ALTIN = Math.round((3300 * rates.USD) / 31.1035);
      rates.GUMUS = Math.round(((33 * rates.USD) / 31.1035) * 100) / 100;
    } catch { console.warn('[rates] API hatası, fallback kullanılıyor'); }

    room.players.forEach(p => {
      const st = makeStarting(); const gl = makeGoal(st.currency, st.amount, rates);
      p.startingCard = st; p.goalCard = gl;
      p.holdings = Object.fromEntries(CURRENCIES.map(c => [c, c === st.currency ? st.amount : 0]));
      p.finished = p.eliminated = false; p.finishRound = null;
      p.madeTransaction = p.usedCredit = false; p.creditDueRound = null; p.portfolioHistory = [];
    });

    room.status = 'playing'; room._locked = false;
    room.gameState = {
      round: 1, rates: {...rates}, lastChanges: {}, event: null, pending: null,
      curIdx: 0, pendingPlayers: new Set(room.players.map((_, i) => i)),
      changeLog: [], rateHistory: {}, forcedBoom: null,
    };
    snapRates(room); drawEvent(room); snapPortfolio(room);
    io.to(room.code).emit('gameStarted');
    io.to(room.code).emit('chatMsg', { name:'🎮 Sistem', msg:`🚀 Oyun başladı! İlk sıra: ${room.players[0].name}` });
    broadcast(room);
    if (room.players[0].isBot) doBotTurn(room);
    else startTmr(room);
  });

  socket.on('buySell', ({ type, targetCurrency, targetAmount, paymentCurrency }) => {
    const room = bySocket(socket.id); if (!room || room.status !== 'playing') return;
    const gs = room.gameState; const cp = room.players[gs.curIdx];
    if (!cp || cp.socketId !== socket.id) return socket.emit('error', 'Sıra sizde değil!');
    if (cp.madeTransaction) return socket.emit('error', 'Bu turda zaten işlem yaptınız!');
    if (targetCurrency === paymentCurrency) return socket.emit('error', 'Aynı para birimi seçemezsiniz!');
    if (!CURRENCIES.includes(targetCurrency) || !CURRENCIES.includes(paymentCurrency)) return socket.emit('error', 'Geçersiz para birimi!');

    const payAmt = (targetAmount * (gs.rates[targetCurrency] || 1)) / (gs.rates[paymentCurrency] || 1);
    if (type === 'buy') {
      if ((cp.holdings[paymentCurrency] || 0) < payAmt - 0.0001) return socket.emit('error', `Yetersiz ${paymentCurrency}!`);
      cp.holdings[paymentCurrency] = (cp.holdings[paymentCurrency] || 0) - payAmt;
      cp.holdings[targetCurrency]  = (cp.holdings[targetCurrency]  || 0) + targetAmount;
    } else {
      if ((cp.holdings[targetCurrency] || 0) < targetAmount - 0.0001) return socket.emit('error', `Yetersiz ${targetCurrency}!`);
      cp.holdings[targetCurrency]  = (cp.holdings[targetCurrency]  || 0) - targetAmount;
      cp.holdings[paymentCurrency] = (cp.holdings[paymentCurrency] || 0) + payAmt;
    }
    cp.madeTransaction = true;

    // İşlem kaydı (analiz için)
    if (!cp.isBot) {
      const totalTL = portfolioTL(cp.holdings, gs.rates);
      const spentTL = payAmt * (gs.rates[paymentCurrency] || 1);
      const spentRatio = totalTL > 0 ? spentTL / totalTL : 0;
      if (!cp.txLog) cp.txLog = [];
      cp.txLog.push({ round: gs.round, spentRatio, gainedCurrency: targetCurrency, spentCurrency: paymentCurrency });
    }

    // Bot varsa ve kullanıcı zarar edecek birime yatırım yaptıysa hakaret et
    botTauntIfHurt(room, targetCurrency);

    if (won(cp, gs.rates)) {
      cp.finished = true; cp.finishRound = gs.round;
      const rank = room.players.filter(p => p.finished && !p.eliminated).length;
      io.to(room.code).emit('playerFinished', { playerName:cp.name, rank });
      io.to(room.code).emit('chatMsg', { name:'🏆 Sistem', msg:`🥇 ${cp.name} hedefine ulaştı! (${rank}. sıra)` });
      const active = room.players.filter(p => !p.finished);
      socket.emit('transactionOk', { holdings:cp.holdings });
      if (active.length <= 1) { if (active.length === 1) { active[0].finished = true; active[0].finishRound = gs.round; } finishGame(room); return; }
      endTurn(room); return;
    }
    socket.emit('transactionOk', { holdings:cp.holdings }); broadcast(room);
  });

  socket.on('takeCredit', () => {
    const room = bySocket(socket.id); if (!room || room.status !== 'playing') return;
    const gs = room.gameState; const cp = room.players[gs.curIdx];
    if (!cp || cp.socketId !== socket.id) return socket.emit('error', 'Sıra sizde değil!');
    if (cp.usedCredit) return socket.emit('error', 'Kredi hakkınızı zaten kullandınız!');
    cp.holdings.TL = (cp.holdings.TL || 0) + CREDIT_AMOUNT;
    cp.usedCredit = true; cp.creditDueRound = gs.round + CREDIT_ROUNDS;
    io.to(room.code).emit('chatMsg', { name:'🏦 Sistem', msg:`💳 ${cp.name} ${CREDIT_AMOUNT.toLocaleString('tr-TR')} TL kredi çekti. Geri ödeme: Tur ${cp.creditDueRound}` });
    socket.emit('creditOk', { amount:CREDIT_AMOUNT, dueRound:cp.creditDueRound, holdings:cp.holdings });
    broadcast(room);
  });

  socket.on('endTurn', () => {
    const room = bySocket(socket.id); if (!room || room.status !== 'playing') return;
    const gs = room.gameState; const cp = room.players[gs.curIdx];
    if (!cp || cp.socketId !== socket.id) return socket.emit('error', 'Sıra sizde değil!');
    endTurn(room);
  });

  socket.on('adminBoost', ({ currency, amount, secret }) => {
    if (secret !== 'KURADMIN2025') return;
    const room = bySocket(socket.id); if (!room || room.host !== socket.id || room.status !== 'playing') return;
    if (!CURRENCIES.includes(currency)) return;
    const p = room.players.find(q => q.socketId === socket.id); if (!p) return;
    p.holdings[currency] = (p.holdings[currency] || 0) + Number(amount);
    socket.emit('adminOk', { currency, amount, newBalance:p.holdings[currency] }); broadcast(room);
  });

  socket.on('disconnect', () => {
    const room = bySocket(socket.id); if (!room) return;
    const p = room.players.find(q => q.socketId === socket.id);
    const name = p?.name || '?';
    if (room.status === 'lobby') {
      room.players = room.players.filter(q => q.socketId !== socket.id || q.isBot);
      if (room.players.filter(q => !q.isBot).length === 0) { delete rooms[room.code]; return; }
      if (room.host === socket.id) { const h = room.players.find(q => !q.isBot); if (h) { room.host = h.socketId; h.isHost = true; } }
      io.to(room.code).emit('playerJoined', { players:room.players });
      io.to(room.code).emit('chatMsg', { name:'🎮 Sistem', msg:`${name} ayrıldı.` });
    } else if (room.status === 'playing' && p && !p.finished) {
      p.finished = p.eliminated = true; p.finishRound = room.gameState?.round || 0;
      if (room.gameState?.pendingPlayers) { const idx = room.players.indexOf(p); room.gameState.pendingPlayers.delete(idx); }
      io.to(room.code).emit('chatMsg', { name:'🎮 Sistem', msg:`⚠️ ${name} bağlantısı kesildi.` });
      const active = room.players.filter(q => !q.finished);
      if (active.length <= 1) { if (active.length === 1) { active[0].finished = true; active[0].finishRound = room.gameState.round; } finishGame(room); return; }
      const gs = room.gameState;
      if (gs && room.players[gs.curIdx]?.socketId === socket.id) endTurn(room);
      else broadcast(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Kur Savaşları → http://localhost:${PORT}`));
