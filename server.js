const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const CURRENCIES = ['TL', 'USD', 'EUR', 'ALTIN', 'STERLIN'];
const TURN_TIMEOUT_MS = 60000;
const CREDIT_AMOUNT = 10000;
const CREDIT_REPAY_ROUNDS = 2;

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
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? generateRoomCode() : code;
}

function generateStarting() {
  const currency = CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)];
  const amounts = { TL: [15000, 40000], USD: [400, 1000], EUR: [350, 900], ALTIN: [5, 12], STERLIN: [300, 800] };
  const [min, max] = amounts[currency];
  return { currency, amount: Math.floor(Math.random() * (max - min)) + min };
}

function generateGoal(startCurrency, startAmount, rates) {
  const startValueTL = startAmount * (rates[startCurrency] || 1);
  const multiplier = 2.5 + Math.random() * 1.5;
  const targetTL = startValueTL * multiplier;
  const available = CURRENCIES.filter(c => c !== startCurrency);
  const currency = available[Math.floor(Math.random() * available.length)];
  const rate = rates[currency] || 1;
  const amount = Math.round((targetTL / rate) * 10) / 10;
  return { currency, amount };
}

function getRoomBySocket(socketId) {
  return Object.values(rooms).find(r => r.players.some(p => p.socketId === socketId));
}

function calculatePortfolioValue(holdings, rates) {
  return CURRENCIES.reduce((sum, c) => sum + (holdings[c] || 0) * (rates[c] || 1), 0);
}

function checkWinCondition(player, rates) {
  return (player.holdings[player.goalCard.currency] || 0) >= player.goalCard.amount;
}

function clearTurnTimer(room) {
  if (room.turnTimer) { clearTimeout(room.turnTimer); room.turnTimer = null; }
}

function startTurnTimer(room) {
  clearTurnTimer(room);
  room.turnTimerStart = Date.now();
  room.turnTimer = setTimeout(() => {
    const gs = room.gameState;
    if (!gs) return;
    const cp = room.players[gs.currentPlayerIndex];
    io.to(room.code).emit('chatMsg', { name: '⏰ Sistem', msg: `${cp ? cp.name : '?'} süreyi aştı, sıra geçiyor...` });
    doEndTurn(room);
  }, TURN_TIMEOUT_MS);
}

function checkCreditRepayments(room) {
  const gs = room.gameState;
  room.players.forEach(player => {
    if (player.finished || player.eliminated) return;
    if (!player.creditDueRound || gs.round < player.creditDueRound) return;
    const portfolioTL = calculatePortfolioValue(player.holdings, gs.rates);
    if (portfolioTL < CREDIT_AMOUNT) {
      player.eliminated = true;
      player.finished = true;
      player.finishRound = gs.round;
      io.to(room.code).emit('playerEliminated', { playerName: player.name, reason: 'Kredi borcunu ödeyemedi!' });
      io.to(room.code).emit('chatMsg', { name: '🏦 Sistem', msg: `💀 ${player.name} kredi borcunu ödeyemedi ve elendi!` });
    } else {
      let remaining = CREDIT_AMOUNT;
      const tlDeduct = Math.min(player.holdings['TL'] || 0, remaining);
      player.holdings['TL'] = (player.holdings['TL'] || 0) - tlDeduct;
      remaining -= tlDeduct;
      if (remaining > 0) {
        for (const c of ['USD', 'EUR', 'STERLIN', 'ALTIN']) {
          if (remaining <= 0) break;
          const rate = gs.rates[c] || 1;
          const deduct = Math.min(player.holdings[c] || 0, remaining / rate);
          player.holdings[c] = (player.holdings[c] || 0) - deduct;
          remaining -= deduct * rate;
        }
      }
      player.creditDueRound = null;
      io.to(room.code).emit('chatMsg', { name: '🏦 Sistem', msg: `✅ ${player.name} kredisini geri ödedi.` });
    }
  });
}

function trackRateHistory(room) {
  const gs = room.gameState;
  if (!gs.rateHistory) gs.rateHistory = {};
  CURRENCIES.forEach(c => {
    if (!gs.rateHistory[c]) gs.rateHistory[c] = [];
    gs.rateHistory[c].push({ round: gs.round, value: gs.rates[c] });
  });
}

function trackPortfolioHistory(room) {
  const gs = room.gameState;
  room.players.forEach(p => {
    if (!p.finished && !p.eliminated) {
      p.portfolioHistory.push({ round: gs.round, value: calculatePortfolioValue(p.holdings, gs.rates) });
    }
  });
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
  trackRateHistory(room);
  io.to(room.code).emit('ratesApplied', {
    event: gs.currentEvent,
    rateChangeLog: gs.rateChangeLog,
    rates: gs.rates,
    lastRateChanges: gs.lastRateChanges,
    rateHistory: gs.rateHistory
  });
}

function drawEventCard(room) {
  const gs = room.gameState;
  const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];
  gs.currentEvent = event;
  gs.pendingRateChanges = {};
  event.affectedCurrencies.forEach(c => {
    gs.pendingRateChanges[c] = (Math.random() * 2 - 1) * event.riskFactor;
  });
  room.players.forEach(p => { p.madeTransaction = false; });
}

function endGame(room) {
  clearTurnTimer(room);
  room.status = 'finished';
  const gs = room.gameState;
  const ranking = [...room.players].sort((a, b) => {
    if (!a.eliminated && a.finishRound && !b.eliminated && b.finishRound) return a.finishRound - b.finishRound;
    if (!a.eliminated && a.finishRound) return -1;
    if (!b.eliminated && b.finishRound) return 1;
    if (a.eliminated && !b.eliminated) return 1;
    if (!a.eliminated && b.eliminated) return -1;
    return calculatePortfolioValue(b.holdings, gs.rates) - calculatePortfolioValue(a.holdings, gs.rates);
  });
  io.to(room.code).emit('gameOver', { ranking, rates: gs.rates });
}

function broadcastGameState(room) {
  const gs = room.gameState;
  const currentPlayer = room.players[gs.currentPlayerIndex];
  const now = Date.now();
  const timerRemaining = room.turnTimerStart ? Math.max(0, TURN_TIMEOUT_MS - (now - room.turnTimerStart)) : TURN_TIMEOUT_MS;
  room.players.forEach(player => {
    const sock = io.sockets.sockets.get(player.socketId);
    if (!sock) return;
    sock.emit('gameState', {
      round: gs.round,
      rates: gs.rates,
      realRates: gs.realRates,
      lastRateChanges: gs.lastRateChanges || {},
      currentEvent: gs.currentEvent,
      currentPlayerSocketId: currentPlayer?.socketId,
      currentPlayerName: currentPlayer?.name,
      isMyTurn: player.socketId === currentPlayer?.socketId,
      timerRemaining,
      rateHistory: gs.rateHistory || {},
      players: room.players.map(p => ({
        socketId: p.socketId, name: p.name, finished: p.finished,
        eliminated: p.eliminated || false, finishRound: p.finishRound,
        holdings: p.holdings, goalCard: p.goalCard, startingCard: p.startingCard,
        madeTransaction: p.madeTransaction, usedCredit: p.usedCredit,
        creditDueRound: p.creditDueRound, portfolioHistory: p.portfolioHistory
      })),
      myPlayer: { ...player }
    });
  });
}

function doEndTurn(room) {
  clearTurnTimer(room);
  const gs = room.gameState;
  const totalPlayers = room.players.length;
  let nextIdx = (gs.currentPlayerIndex + 1) % totalPlayers;
  let steps = 0;
  while (room.players[nextIdx].finished && steps < totalPlayers) {
    nextIdx = (nextIdx + 1) % totalPlayers;
    steps++;
  }
  const firstActiveIdx = room.players.findIndex(p => !p.finished);
  const isNewRound = (firstActiveIdx !== -1) && (
    nextIdx <= firstActiveIdx ||
    room.players.slice(gs.currentPlayerIndex + 1).every(p => p.finished)
  );
  if (isNewRound) {
    gs.round++;
    applyRateChanges(room);
    checkCreditRepayments(room);
    const stillActive = room.players.filter(p => !p.finished);
    if (stillActive.length <= 1) {
      if (stillActive.length === 1) { stillActive[0].finished = true; stillActive[0].finishRound = gs.round; }
      endGame(room); return;
    }
    trackPortfolioHistory(room);
    drawEventCard(room);
    nextIdx = (gs.currentPlayerIndex + 1) % totalPlayers;
    steps = 0;
    while (room.players[nextIdx].finished && steps < totalPlayers) {
      nextIdx = (nextIdx + 1) % totalPlayers;
      steps++;
    }
  }
  gs.currentPlayerIndex = nextIdx;
  broadcastGameState(room);
  startTurnTimer(room);
}

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on('createRoom', ({ name }) => {
    const code = generateRoomCode();
    rooms[code] = { code, host: socket.id, players: [], gameState: null, status: 'lobby', turnTimer: null, turnTimerStart: null };
    const starting = generateStarting();
    const goal = generateGoal(starting.currency, starting.amount, FALLBACK_RATES);
    const player = {
      socketId: socket.id, name, ready: false, isHost: true,
      startingCard: starting, goalCard: goal,
      holdings: Object.fromEntries(CURRENCIES.map(c => [c, c === starting.currency ? starting.amount : 0])),
      finished: false, eliminated: false, finishRound: null,
      madeTransaction: false, usedCredit: false, creditDueRound: null, portfolioHistory: []
    };
    rooms[code].players.push(player);
    socket.join(code);
    socket.emit('roomCreated', { code, player });
  });

  socket.on('joinRoom', ({ code, name }) => {
    const room = rooms[code.toUpperCase()];
    if (!room) return socket.emit('error', 'Oda bulunamadı!');
    if (room.status !== 'lobby') return socket.emit('error', 'Oyun zaten başladı!');
    if (room.players.length >= 6) return socket.emit('error', 'Oda dolu!');
    const starting = generateStarting();
    const goal = generateGoal(starting.currency, starting.amount, FALLBACK_RATES);
    const player = {
      socketId: socket.id, name, ready: false, isHost: false,
      startingCard: starting, goalCard: goal,
      holdings: Object.fromEntries(CURRENCIES.map(c => [c, c === starting.currency ? starting.amount : 0])),
      finished: false, eliminated: false, finishRound: null,
      madeTransaction: false, usedCredit: false, creditDueRound: null, portfolioHistory: []
    };
    room.players.push(player);
    socket.join(code.toUpperCase());
    socket.emit('joinedRoom', { code: code.toUpperCase(), player, players: room.players });
    io.to(code.toUpperCase()).emit('playerJoined', { players: room.players });
    io.to(code.toUpperCase()).emit('chatMsg', { name: '🎮 Sistem', msg: `${name} lobiye katıldı!` });
  });

  socket.on('refreshCards', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'lobby') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const starting = generateStarting();
    const goal = generateGoal(starting.currency, starting.amount, FALLBACK_RATES);
    player.startingCard = starting; player.goalCard = goal;
    player.holdings = Object.fromEntries(CURRENCIES.map(c => [c, c === starting.currency ? starting.amount : 0]));
    socket.emit('cardsRefreshed', { startingCard: starting, goalCard: goal });
    io.to(room.code).emit('playerJoined', { players: room.players });
  });

  socket.on('setReady', ({ ready }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (player) player.ready = ready;
    io.to(room.code).emit('playerJoined', { players: room.players });
  });

  socket.on('chat', ({ msg }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const sanitized = String(msg).slice(0, 150).trim();
    if (!sanitized) return;
    io.to(room.code).emit('chatMsg', { name: player.name, msg: sanitized });
  });

  socket.on('startGame', async () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    if (room.host !== socket.id) return socket.emit('error', 'Sadece oda sahibi başlatabilir!');
    if (room.players.length < 2) return socket.emit('error', 'En az 2 oyuncu gerekli!');
    let realRates = { ...FALLBACK_RATES };
    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch('https://api.exchangerate-api.com/v4/latest/TRY', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        realRates = { TL: 1, USD: Math.round((1/data.rates.USD)*100)/100, EUR: Math.round((1/data.rates.EUR)*100)/100, STERLIN: Math.round((1/data.rates.GBP)*100)/100, ALTIN: 3200 };
      }
    } catch(e) { console.warn('Kur alınamadı, fallback kullanılıyor.'); }
    room.players.forEach(p => {
      const starting = generateStarting();
      const goal = generateGoal(starting.currency, starting.amount, realRates);
      p.startingCard = starting; p.goalCard = goal;
      p.holdings = Object.fromEntries(CURRENCIES.map(c => [c, c === starting.currency ? starting.amount : 0]));
      p.finished = false; p.eliminated = false; p.finishRound = null;
      p.madeTransaction = false; p.usedCredit = false; p.creditDueRound = null; p.portfolioHistory = [];
    });
    room.status = 'playing';
    room.gameState = {
      round: 1, rates: { ...realRates }, realRates,
      lastRateChanges: {}, currentEvent: null, pendingRateChanges: null,
      currentPlayerIndex: 0, rateChangeLog: [], rateHistory: {}
    };
    trackRateHistory(room);
    drawEventCard(room);
    trackPortfolioHistory(room);
    io.to(room.code).emit('gameStarted');
    io.to(room.code).emit('chatMsg', { name: '🎮 Sistem', msg: `🚀 Oyun başladı! İlk sıra: ${room.players[0].name}` });
    broadcastGameState(room);
    startTurnTimer(room);
  });

  socket.on('buySell', ({ type, targetCurrency, targetAmount, paymentCurrency }) => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'playing') return;
    const gs = room.gameState;
    const cp = room.players[gs.currentPlayerIndex];
    if (cp.socketId !== socket.id) return socket.emit('error', 'Sıra sizde değil!');
    if (cp.madeTransaction) return socket.emit('error', 'Bu turda zaten işlem yaptınız!');
    if (targetCurrency === paymentCurrency) return socket.emit('error', 'Aynı para birimi seçemezsiniz!');
    const paymentAmount = (targetAmount * gs.rates[targetCurrency]) / gs.rates[paymentCurrency];
    if (type === 'buy') {
      if ((cp.holdings[paymentCurrency] || 0) < paymentAmount) return socket.emit('error', `Yetersiz ${paymentCurrency} bakiyesi!`);
      cp.holdings[paymentCurrency] -= paymentAmount;
      cp.holdings[targetCurrency] = (cp.holdings[targetCurrency] || 0) + targetAmount;
    } else {
      if ((cp.holdings[targetCurrency] || 0) < targetAmount) return socket.emit('error', `Yetersiz ${targetCurrency} bakiyesi!`);
      cp.holdings[targetCurrency] -= targetAmount;
      cp.holdings[paymentCurrency] = (cp.holdings[paymentCurrency] || 0) + paymentAmount;
    }
    cp.madeTransaction = true;
    if (checkWinCondition(cp, gs.rates)) {
      cp.finished = true; cp.finishRound = gs.round;
      const rank = room.players.filter(p => p.finished && !p.eliminated).length;
      io.to(room.code).emit('playerFinished', { playerName: cp.name, rank });
      io.to(room.code).emit('chatMsg', { name: '🏆 Sistem', msg: `🥇 ${cp.name} hedefine ulaştı! (${rank}. sıra)` });
      const stillActive = room.players.filter(p => !p.finished);
      if (stillActive.length <= 1) {
        if (stillActive.length === 1) { stillActive[0].finished = true; stillActive[0].finishRound = gs.round; }
        endGame(room); return;
      }
    }
    socket.emit('transactionOk', { holdings: cp.holdings });
    broadcastGameState(room);
  });

  socket.on('takeCredit', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'playing') return;
    const gs = room.gameState;
    const cp = room.players[gs.currentPlayerIndex];
    if (cp.socketId !== socket.id) return socket.emit('error', 'Sıra sizde değil!');
    if (cp.usedCredit) return socket.emit('error', 'Kredi hakkınızı zaten kullandınız!');
    cp.holdings['TL'] = (cp.holdings['TL'] || 0) + CREDIT_AMOUNT;
    cp.usedCredit = true;
    cp.creditDueRound = gs.round + CREDIT_REPAY_ROUNDS;
    io.to(room.code).emit('chatMsg', { name: '🏦 Sistem', msg: `💳 ${cp.name} ${CREDIT_AMOUNT.toLocaleString('tr-TR')} TL kredi çekti. Geri ödeme: Tur ${cp.creditDueRound}` });
    socket.emit('creditOk', { amount: CREDIT_AMOUNT, dueRound: cp.creditDueRound, holdings: cp.holdings });
    broadcastGameState(room);
  });

  socket.on('endTurn', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.status !== 'playing') return;
    const gs = room.gameState;
    const cp = room.players[gs.currentPlayerIndex];
    if (cp.socketId !== socket.id) return socket.emit('error', 'Sıra sizde değil!');
    doEndTurn(room);
  });

  socket.on('adminBoost', ({ currency, amount, secret }) => {
    if (secret !== 'KURADMIN2025') return;
    const room = getRoomBySocket(socket.id);
    if (!room || room.host !== socket.id || room.status !== 'playing') return;
    const me = room.players.find(p => p.socketId === socket.id);
    if (!me) return;
    me.holdings[currency] = (me.holdings[currency] || 0) + Number(amount);
    socket.emit('adminOk', { currency, amount, newBalance: me.holdings[currency] });
    broadcastGameState(room);
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    const playerName = player?.name || '?';
    if (room.status === 'lobby') {
      room.players = room.players.filter(p => p.socketId !== socket.id);
      if (room.players.length === 0) { delete rooms[room.code]; return; }
      if (room.host === socket.id) { room.host = room.players[0].socketId; room.players[0].isHost = true; }
      io.to(room.code).emit('playerJoined', { players: room.players });
      io.to(room.code).emit('chatMsg', { name: '🎮 Sistem', msg: `${playerName} ayrıldı.` });
    } else if (room.status === 'playing' && player && !player.finished) {
      player.finished = true; player.eliminated = true; player.finishRound = room.gameState?.round || 0;
      io.to(room.code).emit('chatMsg', { name: '🎮 Sistem', msg: `⚠️ ${playerName} bağlantısı kesildi ve elendi.` });
      const stillActive = room.players.filter(p => !p.finished);
      if (stillActive.length <= 1) {
        if (stillActive.length === 1) { stillActive[0].finished = true; stillActive[0].finishRound = room.gameState.round; }
        endGame(room); return;
      }
      if (room.gameState && room.players[room.gameState.currentPlayerIndex]?.socketId === socket.id) {
        doEndTurn(room);
      } else {
        broadcastGameState(room);
      }
    }
    console.log(`[-] ${socket.id} (${playerName})`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Kur Savaşları: http://localhost:${PORT}`));
