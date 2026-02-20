const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
     res.sendFile(path.join(__dirname, 'public', 'index.html'));
   });

// ─── Oyun Sabitleri ───────────────────────────────────────────────────────────
const CURRENCIES = ['TL', 'USD', 'EUR', 'ALTIN', 'STERLIN'];

const EVENTS = [
  { name: "Amerika Türkiye'ye Yaptırım Uyguladı", affectedCurrencies: ['USD', 'EUR'], riskFactor: 15 },
  { name: 'Türkiye Doğalgaz Rezervi Buldu', affectedCurrencies: ['USD', 'EUR'], riskFactor: 12 },
  { name: 'Avrupa Merkez Bankası Faiz Artırdı', affectedCurrencies: ['EUR', 'STERLIN'], riskFactor: 18 },
  { name: 'Küresel Altın Talebi Arttı', affectedCurrencies: ['ALTIN', 'USD'], riskFactor: 20 },
  { name: 'İngiltere Ekonomik Kriz Yaşıyor', affectedCurrencies: ['STERLIN', 'EUR'], riskFactor: 25 },
  { name: 'ABD Enflasyon Verisi Beklentinin Üstünde', affectedCurrencies: ['USD', 'ALTIN'], riskFactor: 15 },
  { name: 'Türkiye Turizm Rekoru Kırdı', affectedCurrencies: ['USD', 'EUR'], riskFactor: 10 },
  { name: 'Petrol Fiyatları Düştü', affectedCurrencies: ['USD', 'EUR', 'ALTIN'], riskFactor: 12 },
  { name: 'Avrupa Birliği Genişleme Planı Açıkladı', affectedCurrencies: ['EUR', 'STERLIN'], riskFactor: 14 },
  { name: 'Altın Madeni Felaketi', affectedCurrencies: ['ALTIN', 'USD'], riskFactor: 22 },
  { name: 'İngiltere Brexit Anlaşmasını Güncelledi', affectedCurrencies: ['STERLIN', 'EUR'], riskFactor: 16 },
  { name: 'Türkiye İhracat Rekoru Kırdı', affectedCurrencies: ['USD', 'EUR'], riskFactor: 11 },
  { name: 'ABD Tahvil Faizleri Yükseldi', affectedCurrencies: ['USD', 'ALTIN'], riskFactor: 13 },
  { name: 'Küresel Salgın Endişesi', affectedCurrencies: ['ALTIN', 'USD', 'EUR'], riskFactor: 30 },
  { name: 'Fed Faiz İndirdi', affectedCurrencies: ['USD', 'ALTIN'], riskFactor: 17 },
  { name: 'Çin Ekonomik Büyüme Açıkladı', affectedCurrencies: ['ALTIN', 'USD'], riskFactor: 14 },
  { name: 'Avrupa Enerji Krizi', affectedCurrencies: ['EUR', 'STERLIN'], riskFactor: 20 },
  { name: 'Küresel Ticaret Savaşı', affectedCurrencies: ['USD', 'EUR', 'ALTIN'], riskFactor: 25 },
  { name: 'Merkez Bankası Faiz Artırımı', affectedCurrencies: ['USD', 'EUR'], riskFactor: 19 },
  { name: 'Altın Üretimi Azaldı', affectedCurrencies: ['ALTIN'], riskFactor: 15 }
];

const FALLBACK_RATES = { TL: 1, USD: 38.50, EUR: 41.20, ALTIN: 3200, STERLIN: 48.80 };

// ─── Odalar ───────────────────────────────────────────────────────────────────
// rooms[roomCode] = { players, gameState, host }
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? generateRoomCode() : code;
}

function generateStarting() {
  const currency = CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)];
  const amounts = { TL: [10000, 60000], USD: [500, 2000], EUR: [400, 1600], ALTIN: [5, 20], STERLIN: [300, 1300] };
  const [min, max] = amounts[currency];
  return { currency, amount: Math.floor(Math.random() * (max - min)) + min };
}

function generateGoal(startCurrency) {
  const available = CURRENCIES.filter(c => c !== startCurrency);
  const currency = available[Math.floor(Math.random() * available.length)];
  const amounts = { TL: [100000, 400000], USD: [3000, 9000], EUR: [2500, 7500], ALTIN: [40, 120], STERLIN: [2000, 6000] };
  const [min, max] = amounts[currency];
  return { currency, amount: Math.floor(Math.random() * (max - min)) + min };
}

function createRoom(hostSocketId, hostName) {
  const code = generateRoomCode();
  rooms[code] = {
    code,
    host: hostSocketId,
    players: [],       // { socketId, name, ready, startingCard, goalCard, holdings, finished, finishRound, madeTransaction, madeTrade, portfolioHistory }
    gameState: null,   // filled when game starts
    status: 'lobby'    // 'lobby' | 'playing' | 'finished'
  };
  return code;
}

function getRoomBySocket(socketId) {
  return Object.values(rooms).find(r => r.players.some(p => p.socketId === socketId));
}

function calculatePortfolioValue(holdings, rates) {
  return CURRENCIES.reduce((sum, c) => sum + (holdings[c] || 0) * rates[c], 0);
}

function checkWinCondition(player, rates) {
  const goalHolding = player.holdings[player.goalCard.currency] || 0;
  return goalHolding >= player.goalCard.amount;
}

function advanceTurn(room) {
  const gs = room.gameState;
  const activePlayers = room.players.filter(p => !p.finished);

  if (activePlayers.length <= 1) {
    endGame(room);
    return;
  }

  // Find next active player after current
  let nextIdx = (gs.currentPlayerIndex + 1) % room.players.length;
  while (room.players[nextIdx].finished) {
    nextIdx = (nextIdx + 1) % room.players.length;
  }

  // If we've wrapped around to the start of the round
  if (nextIdx <= gs.currentPlayerIndex || room.players.slice(gs.currentPlayerIndex + 1).every(p => p.finished)) {
    // All players in this round have gone — apply rate changes
    gs.round++;
    applyRateChanges(room);
    trackPortfolioHistory(room);
    drawEventCard(room);
  }

  gs.currentPlayerIndex = nextIdx;
  broadcastGameState(room);
}

function applyRateChanges(room) {
  const gs = room.gameState;
  if (!gs.pendingRateChanges) return;

  gs.lastRateChanges = {};
  gs.rateChangeLog = [];

  Object.entries(gs.pendingRateChanges).forEach(([currency, change]) => {
    if (currency === 'TL') return;
    const old = gs.rates[currency];
    gs.rates[currency] = Math.round(gs.rates[currency] * (1 + change / 100) * 100) / 100;
    gs.lastRateChanges[currency] = change;
    gs.rateChangeLog.push({ currency, old, new: gs.rates[currency], change });
  });

  gs.pendingRateChanges = null;

  io.to(room.code).emit('ratesApplied', {
    event: gs.currentEvent,
    rateChangeLog: gs.rateChangeLog,
    rates: gs.rates,
    lastRateChanges: gs.lastRateChanges
  });
}

function drawEventCard(room) {
  const gs = room.gameState;
  const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  gs.currentEvent = event;
  gs.pendingRateChanges = {};

  event.affectedCurrencies.forEach(currency => {
    gs.pendingRateChanges[currency] = (Math.random() * 2 - 1) * event.riskFactor;
  });

  // Reset per-turn flags
  room.players.forEach(p => {
    p.madeTransaction = false;
    p.madeTrade = false;
  });
}

function trackPortfolioHistory(room) {
  const gs = room.gameState;
  room.players.forEach(p => {
    if (!p.finished) {
      p.portfolioHistory.push({ round: gs.round, value: calculatePortfolioValue(p.holdings, gs.rates) });
    }
  });
}

function broadcastGameState(room) {
  const gs = room.gameState;
  const currentPlayer = room.players[gs.currentPlayerIndex];

  // Send full state to all (we hide pending changes)
  room.players.forEach(player => {
    const socket = io.sockets.sockets.get(player.socketId);
    if (!socket) return;

    socket.emit('gameState', {
      round: gs.round,
      rates: gs.rates,
      realRates: gs.realRates,
      lastRateChanges: gs.lastRateChanges || {},
      currentEvent: gs.currentEvent,
      currentPlayerSocketId: currentPlayer?.socketId,
      currentPlayerName: currentPlayer?.name,
      isMyTurn: player.socketId === currentPlayer?.socketId,
      players: room.players.map(p => ({
        socketId: p.socketId,
        name: p.name,
        finished: p.finished,
        finishRound: p.finishRound,
        holdings: p.holdings,
        goalCard: p.goalCard,
        startingCard: p.startingCard,
        madeTransaction: p.madeTransaction,
        madeTrade: p.madeTrade,
        portfolioHistory: p.portfolioHistory
      })),
      myPlayer: {
        ...player,
        portfolioHistory: player.portfolioHistory
      }
    });
  });
}

function endGame(room) {
  room.status = 'finished';
  const ranking = [...room.players].sort((a, b) => {
    if (a.finishRound && b.finishRound) return a.finishRound - b.finishRound;
    if (a.finishRound) return -1;
    if (b.finishRound) return 1;
    const aVal = calculatePortfolioValue(a.holdings, room.gameState.rates);
    const bVal = calculatePortfolioValue(b.holdings, room.gameState.rates);
    return bVal - aVal;
  });

  io.to(room.code).emit('gameOver', { ranking, rates: room.gameState.rates });
}

// ─── Socket.io Olayları ───────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Bağlandı: ${socket.id}`);

  // ── Oda Oluştur ──
  socket.on('createRoom', ({ name }) => {
    const code = createRoom(socket.id, name);
    const starting = generateStarting();
    const goal = generateGoal(starting.currency);

    const player = {
      socketId: socket.id,
      name,
      ready: false,
      isHost: true,
      startingCard: starting,
      goalCard: goal,
      holdings: Object.fromEntries(CURRENCIES.map(c => [c, c === starting.currency ? starting.amount : 0])),
      finished: false,
      finishRound: null,
      madeTransaction: false,
      madeTrade: false,
      portfolioHistory: []
    };

    rooms[code].players.push(player);
    socket.join(code);
    socket.emit('roomCreated', { code, player });
    console.log(`[ROOM] ${name} oda oluşturdu: ${code}`);
  });

  // ── Odaya Katıl ──
  socket.on('joinRoom', ({ code, name }) => {
    const room = rooms[code.toUpperCase()];
    if (!room) return socket.emit('error', 'Oda bulunamadı!');
    if (room.status !== 'lobby') return socket.emit('error', 'Oyun zaten başladı!');
    if (room.players.length >= 6) return socket.emit('error', 'Oda dolu! (Max 6 oyuncu)');

    const starting = generateStarting();
    const goal = generateGoal(starting.currency);

    const player = {
      socketId: socket.id,
      name,
      ready: false,
      isHost: false,
      startingCard: starting,
      goalCard: goal,
      holdings: Object.fromEntries(CURRENCIES.map(c => [c, c === starting.currency ? starting.amount : 0])),
      finished: false,
      finishRound: null,
      madeTransaction: false,
      madeTrade: false,
      portfolioHistory: []
    };

    room.players.push(player);
    socket.join(code.toUpperCase());
    socket.emit('joinedRoom', { code: code.toUpperCase(), player, players: room.players });
    io.to(code.toUpperCase()).emit('playerJoined', { players: room.players });
    console.log(`[ROOM] ${name} odaya katıldı: ${code}`);
  });

  // ── Kartları Yenile ──
  socket.on('refreshCards', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'lobby') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const starting = generateStarting();
    const goal = generateGoal(starting.currency);
    player.startingCard = starting;
    player.goalCard = goal;
    player.holdings = Object.fromEntries(CURRENCIES.map(c => [c, c === starting.currency ? starting.amount : 0]));

    socket.emit('cardsRefreshed', { startingCard: starting, goalCard: goal });
    io.to(room.code).emit('playerJoined', { players: room.players });
  });

  // ── Hazır ──
  socket.on('setReady', ({ ready }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (player) player.ready = ready;
    io.to(room.code).emit('playerJoined', { players: room.players });
  });

  // ── Oyunu Başlat ──
  socket.on('startGame', async () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (room.host !== socket.id) return socket.emit('error', 'Sadece oda sahibi oyunu başlatabilir!');
    if (room.players.length < 2) return socket.emit('error', 'En az 2 oyuncu gerekli!');

    // Fetch real rates (best effort)
    let realRates = { ...FALLBACK_RATES };
    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/TRY', { timeout: 5000 });
      if (res.ok) {
        const data = await res.json();
        realRates = {
          TL: 1,
          USD: Math.round((1 / data.rates.USD) * 100) / 100,
          EUR: Math.round((1 / data.rates.EUR) * 100) / 100,
          STERLIN: Math.round((1 / data.rates.GBP) * 100) / 100,
          ALTIN: 3200
        };
      }
    } catch (e) {
      console.warn('Gerçek kurlar alınamadı, fallback kullanılıyor.');
    }

    room.status = 'playing';
    room.gameState = {
      round: 1,
      rates: { ...realRates },
      realRates,
      lastRateChanges: {},
      currentEvent: null,
      pendingRateChanges: null,
      currentPlayerIndex: 0,
      rateChangeLog: []
    };

    drawEventCard(room);
    trackPortfolioHistory(room);

    io.to(room.code).emit('gameStarted');
    broadcastGameState(room);
    console.log(`[GAME] Oyun başladı: ${room.code}`);
  });

  // ── Al/Sat ──
  socket.on('buySell', ({ type, targetCurrency, targetAmount, paymentCurrency }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'playing') return;
    const gs = room.gameState;
    const currentPlayer = room.players[gs.currentPlayerIndex];

    if (currentPlayer.socketId !== socket.id) return socket.emit('error', 'Sıra sizde değil!');
    if (currentPlayer.madeTransaction) return socket.emit('error', 'Bu turda zaten işlem yaptınız!');
    if (targetCurrency === paymentCurrency) return socket.emit('error', 'Aynı para birimini hem alıp hem veremezsiniz!');

    const targetRateInTL = gs.rates[targetCurrency];
    const paymentRateInTL = gs.rates[paymentCurrency];
    const paymentAmount = (targetAmount * targetRateInTL) / paymentRateInTL;

    if (type === 'buy') {
      if ((currentPlayer.holdings[paymentCurrency] || 0) < paymentAmount)
        return socket.emit('error', `Yetersiz ${paymentCurrency} bakiyesi!`);
      currentPlayer.holdings[paymentCurrency] -= paymentAmount;
      currentPlayer.holdings[targetCurrency] = (currentPlayer.holdings[targetCurrency] || 0) + targetAmount;
    } else {
      if ((currentPlayer.holdings[targetCurrency] || 0) < targetAmount)
        return socket.emit('error', `Yetersiz ${targetCurrency} bakiyesi!`);
      currentPlayer.holdings[targetCurrency] -= targetAmount;
      currentPlayer.holdings[paymentCurrency] = (currentPlayer.holdings[paymentCurrency] || 0) + paymentAmount;
    }

    currentPlayer.madeTransaction = true;

    // Kazanma kontrolü
    if (checkWinCondition(currentPlayer, gs.rates)) {
      currentPlayer.finished = true;
      currentPlayer.finishRound = gs.round;
      io.to(room.code).emit('playerFinished', { playerName: currentPlayer.name, rank: room.players.filter(p => p.finished).length });
    }

    socket.emit('transactionOk', { holdings: currentPlayer.holdings });
    broadcastGameState(room);
  });

  // ── Oyuncu Arası Ticaret ──
  socket.on('playerTrade', ({ targetSocketId, giveCurrency, giveAmount, receiveCurrency, receiveAmount }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'playing') return;
    const gs = room.gameState;
    const currentPlayer = room.players[gs.currentPlayerIndex];

    if (currentPlayer.socketId !== socket.id) return socket.emit('error', 'Sıra sizde değil!');
    if (currentPlayer.madeTrade) return socket.emit('error', 'Bu turda zaten ticaret yaptınız!');

    const partner = room.players.find(p => p.socketId === targetSocketId);
    if (!partner || partner.finished) return socket.emit('error', 'Geçersiz oyuncu!');

    if ((currentPlayer.holdings[giveCurrency] || 0) < giveAmount)
      return socket.emit('error', `Yetersiz ${giveCurrency} bakiyesi!`);
    if ((partner.holdings[receiveCurrency] || 0) < receiveAmount)
      return socket.emit('error', `${partner.name} oyuncusunun ${receiveCurrency} bakiyesi yetersiz!`);

    // Hedef kısıtlamaları
    if (giveCurrency === partner.goalCard.currency && giveAmount > partner.goalCard.amount / 2)
      return socket.emit('error', `${partner.name} için maksimum ${partner.goalCard.amount / 2} ${giveCurrency} verebilirsiniz!`);
    if (receiveCurrency === currentPlayer.goalCard.currency && receiveAmount > currentPlayer.goalCard.amount / 2)
      return socket.emit('error', `Hedef biriminizden maksimum ${currentPlayer.goalCard.amount / 2} ${receiveCurrency} alabilirsiniz!`);

    currentPlayer.holdings[giveCurrency] -= giveAmount;
    currentPlayer.holdings[receiveCurrency] = (currentPlayer.holdings[receiveCurrency] || 0) + receiveAmount;
    partner.holdings[receiveCurrency] -= receiveAmount;
    partner.holdings[giveCurrency] = (partner.holdings[giveCurrency] || 0) + giveAmount;

    currentPlayer.madeTrade = true;

    socket.emit('tradeOk', { giveCurrency, giveAmount, receiveCurrency, receiveAmount, partnerName: partner.name });
    broadcastGameState(room);
  });

  // ── Turu Bitir ──
  socket.on('endTurn', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'playing') return;
    const gs = room.gameState;
    const currentPlayer = room.players[gs.currentPlayerIndex];

    if (currentPlayer.socketId !== socket.id) return socket.emit('error', 'Sıra sizde değil!');

    const activePlayers = room.players.filter(p => !p.finished);
    if (activePlayers.length <= 1) { endGame(room); return; }

    // Find next active player
    let nextIdx = (gs.currentPlayerIndex + 1) % room.players.length;
    let wrapped = false;

    while (room.players[nextIdx].finished) {
      nextIdx = (nextIdx + 1) % room.players.length;
    }

    // Check if we've completed a full round (next player comes before or equal to first active)
    const firstActiveIdx = room.players.findIndex(p => !p.finished);
    if (nextIdx <= firstActiveIdx && gs.currentPlayerIndex >= firstActiveIdx) {
      // New round
      gs.round++;
      applyRateChanges(room);
      trackPortfolioHistory(room);
      drawEventCard(room);
    }

    gs.currentPlayerIndex = nextIdx;
    broadcastGameState(room);
  });

  // ─── Bağlantı Kesilince ───────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const playerName = room.players.find(p => p.socketId === socket.id)?.name || '?';

    if (room.status === 'lobby') {
      room.players = room.players.filter(p => p.socketId !== socket.id);
      if (room.players.length === 0) {
        delete rooms[room.code];
        console.log(`[ROOM] Oda silindi: ${room.code}`);
      } else {
        if (room.host === socket.id) room.host = room.players[0].socketId;
        io.to(room.code).emit('playerLeft', { name: playerName, players: room.players });
      }
    } else {
      // In game: mark as disconnected but don't remove
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.disconnected = true;
        io.to(room.code).emit('playerDisconnected', { name: playerName });
      }
    }

    console.log(`[-] Ayrıldı: ${socket.id} (${playerName})`);
  });
});

// ─── Sunucuyu Başlat ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮 Kur Savaşları Sunucusu çalışıyor!`);
  console.log(`📡 http://localhost:${PORT}\n`);
});
