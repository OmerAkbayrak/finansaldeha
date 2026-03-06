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
// Render keep-alive endpoint
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

const FALLBACK = { TL:1, USD:38.5, EUR:41.2, ALTIN:3800, GUMUS:45, STERLIN:48.8 };

const EVENTS = [
  { name:"Amerika Türkiye'ye Yaptırım Uyguladı", affected:['USD','EUR'],         risk:15 },
  { name:'Türkiye Doğalgaz Rezervi Buldu',        affected:['USD','EUR'],         risk:12 },
  { name:'Avrupa Merkez Bankası Faiz Artırdı',    affected:['EUR','STERLIN'],     risk:18 },
  { name:'Küresel Altın Talebi Arttı',            affected:['ALTIN','USD'],       risk:20 },
  { name:'Gümüş Endüstriyel Talebi Patladı',      affected:['GUMUS','ALTIN'],     risk:18 },
  { name:'İngiltere Ekonomik Kriz Yaşıyor',       affected:['STERLIN','EUR'],     risk:25 },
  { name:'ABD Enflasyon Beklentinin Üstünde',     affected:['USD','ALTIN'],       risk:15 },
  { name:'Türkiye Turizm Rekoru Kırdı',           affected:['USD','EUR'],         risk:10 },
  { name:'Petrol Fiyatları Düştü',                affected:['USD','EUR','ALTIN'], risk:12 },
  { name:'AB Genişleme Planı Açıkladı',           affected:['EUR','STERLIN'],     risk:14 },
  { name:'Altın Madeni Felaketi',                 affected:['ALTIN','GUMUS'],     risk:22 },
  { name:'Gümüş Madeni Grevi',                    affected:['GUMUS'],             risk:20 },
  { name:'İngiltere Brexit Güncelledi',           affected:['STERLIN','EUR'],     risk:16 },
  { name:'Türkiye İhracat Rekoru Kırdı',          affected:['USD','EUR'],         risk:11 },
  { name:'ABD Tahvil Faizleri Yükseldi',          affected:['USD','ALTIN'],       risk:13 },
  { name:'Küresel Salgın Endişesi',               affected:['ALTIN','USD','EUR'], risk:30 },
  { name:'Fed Faiz İndirdi',                      affected:['USD','ALTIN'],       risk:17 },
  { name:'Çin Ekonomik Büyüme Açıkladı',          affected:['ALTIN','GUMUS'],     risk:14 },
  { name:'Avrupa Enerji Krizi',                   affected:['EUR','STERLIN'],     risk:20 },
  { name:'Küresel Ticaret Savaşı',                affected:['USD','EUR','ALTIN'], risk:25 },
  { name:'Merkez Bankası Faiz Artırımı',          affected:['USD','EUR'],         risk:19 },
  { name:'Altın Üretimi Azaldı',                  affected:['ALTIN','GUMUS'],     risk:15 },
  { name:'Yeşil Enerji Dönüşümü',                affected:['GUMUS'],             risk:16 },
  { name:'Küresel Resesyon Korkusu',              affected:['USD','EUR','GUMUS'], risk:22 },
];

const rooms = {};

// ── Yardımcılar ───────────────────────────────────────────────────────────────
function genCode() {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c=''; for(let i=0;i<6;i++) c+=ch[Math.floor(Math.random()*ch.length)];
  return rooms[c] ? genCode() : c;
}
function makeStarting() {
  const c = CURRENCIES[Math.floor(Math.random()*CURRENCIES.length)];
  const r = { TL:[12000,30000], USD:[300,750], EUR:[270,680], ALTIN:[2,6], GUMUS:[150,450], STERLIN:[230,600] };
  const [mn,mx] = r[c];
  return { currency:c, amount: Math.floor(Math.random()*(mx-mn))+mn };
}
function makeGoal(sc, sa, rates) {
  const tlVal = sa*(rates[sc]||1);
  const mult  = 1.5 + Math.random();   // 1.5x–2.5x → daha hızlı biter
  const target= tlVal*mult;
  const opts  = CURRENCIES.filter(c=>c!==sc);
  const c     = opts[Math.floor(Math.random()*opts.length)];
  return { currency:c, amount: Math.round((target/(rates[c]||1))*100)/100 };
}
function bySocket(sid) {
  return Object.values(rooms).find(r=>r.players.some(p=>p.socketId===sid));
}
function portfolioTL(h,rates) {
  return CURRENCIES.reduce((s,c)=>s+(h[c]||0)*(rates[c]||1),0);
}
function won(player,rates) {
  return (player.holdings[player.goalCard.currency]||0)>=player.goalCard.amount;
}
function newPlayer(sid,name,isHost,rates,isBot=false) {
  const st=makeStarting(); const gl=makeGoal(st.currency,st.amount,rates);
  return {
    socketId:sid, name, ready:false, isHost, isBot,
    startingCard:st, goalCard:gl,
    holdings: Object.fromEntries(CURRENCIES.map(c=>[c,c===st.currency?st.amount:0])),
    finished:false, eliminated:false, finishRound:null,
    madeTransaction:false, usedCredit:false, creditDueRound:null, portfolioHistory:[],
  };
}

// ── Kick yardımcısı ───────────────────────────────────────────────────────────
function kickPlayer(room, targetName, kickerName) {
  const gs = room.gameState;
  const idx = room.players.findIndex(p => p.name.toLowerCase()===targetName.toLowerCase() && !p.finished);
  if (idx===-1) return false;
  const p = room.players[idx];
  if (p.isBot) return false; // botu kickleme (bot ayrı yönetilir)
  p.finished=true; p.eliminated=true; p.finishRound=gs?.round||0;
  if (gs?.pendingPlayers) gs.pendingPlayers.delete(idx);
  io.to(room.code).emit('chatMsg',{name:'🔨 Sistem',msg:`🚫 ${p.name} oyundan atıldı! (${kickerName} tarafından)`});
  io.to(room.code).emit('playerEliminated',{playerName:p.name,reason:'Oyundan atıldı!'});
  const active=room.players.filter(q=>!q.finished);
  if(active.length<=1){
    if(active.length===1){active[0].finished=true;active[0].finishRound=gs?.round||0;}
    finishGame(room); return true;
  }
  if(gs && room.players[gs.curIdx]?.socketId===p.socketId) endTurn(room);
  else broadcast(room);
  return true;
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function clearTmr(room) {
  if(room._tmr){clearTimeout(room._tmr);room._tmr=null;}
  room._tmrStart=null;
}
function startTmr(room) {
  clearTmr(room);
  room._tmrStart=Date.now();
  room._tmr=setTimeout(()=>{
    if(!room.gameState||room.status!=='playing')return;
    const cp=room.players[room.gameState.curIdx];
    io.to(room.code).emit('chatMsg',{name:'⏰ Sistem',msg:`${cp?.name||'?'} süreyi aştı, sıra geçiyor...`});
    endTurn(room);
  },TURN_MS);
}

// ── Olay ──────────────────────────────────────────────────────────────────────
function drawEvent(room) {
  const ev=EVENTS[Math.floor(Math.random()*EVENTS.length)];
  const gs=room.gameState;
  gs.event=ev; gs.pending={};
  ev.affected.forEach(c=>{ gs.pending[c]=(Math.random()*2-1)*ev.risk; });
}

// ── Kurlar + BOOM ─────────────────────────────────────────────────────────────
function applyRates(room) {
  const gs=room.gameState;
  gs.lastChanges={}; gs.changeLog=[];
  Object.entries(gs.pending||{}).forEach(([c,pct])=>{
    if(c==='TL')return;
    const old=gs.rates[c];
    const nv=Math.max(0.01,Math.round(old*(1+pct/100)*100)/100);
    gs.rates[c]=nv; gs.lastChanges[c]=pct;
    gs.changeLog.push({currency:c,old,new:nv,change:pct});
  });
  gs.pending=null;
  let boom=null;
  if(Math.random()<BOOM_CHANCE){
    const bc=BOOM_CURRENCIES[Math.floor(Math.random()*BOOM_CURRENCIES.length)];
    const old=gs.rates[bc];
    const nv=Math.round(old*(1+BOOM_GAIN/100)*100)/100;
    gs.rates[bc]=nv; gs.lastChanges[bc]=(gs.lastChanges[bc]||0)+BOOM_GAIN;
    boom={currency:bc,oldVal:old,newVal:nv};
    io.to(room.code).emit('chatMsg',{name:'🚀 Sistem',msg:`🚀💥 AŞIRI YÜKSELİŞ! ${bc} %${BOOM_GAIN} değer kazandı! (${old.toFixed(2)} → ${nv.toFixed(2)} ₺)`});
  }
  snapRates(room);
  io.to(room.code).emit('ratesApplied',{event:gs.event,changeLog:gs.changeLog,rates:{...gs.rates},lastChanges:{...gs.lastChanges}});
  if(boom) io.to(room.code).emit('boom',boom);
}
function snapRates(room) {
  const gs=room.gameState; if(!gs.rateHistory)gs.rateHistory={};
  CURRENCIES.forEach(c=>{
    if(!gs.rateHistory[c])gs.rateHistory[c]=[];
    gs.rateHistory[c].push({round:gs.round,value:gs.rates[c]});
  });
}
function snapPortfolio(room) {
  const gs=room.gameState;
  room.players.forEach(p=>{ if(!p.finished) p.portfolioHistory.push({round:gs.round,value:portfolioTL(p.holdings,gs.rates)}); });
}

// ── Kredi ─────────────────────────────────────────────────────────────────────
function checkCredits(room) {
  const gs=room.gameState;
  room.players.forEach(p=>{
    if(p.finished||!p.creditDueRound||gs.round<p.creditDueRound)return;
    const total=portfolioTL(p.holdings,gs.rates);
    if(total<CREDIT_AMOUNT){
      p.eliminated=p.finished=true; p.finishRound=gs.round;
      io.to(room.code).emit('playerEliminated',{playerName:p.name,reason:'Kredi borcunu ödeyemedi!'});
      io.to(room.code).emit('chatMsg',{name:'🏦 Sistem',msg:`💀 ${p.name} kredi borcunu ödeyemedi!`});
    } else {
      let rem=CREDIT_AMOUNT;
      const tlD=Math.min(p.holdings.TL||0,rem); p.holdings.TL=(p.holdings.TL||0)-tlD; rem-=tlD;
      for(const c of ['USD','EUR','STERLIN','ALTIN','GUMUS']){
        if(rem<=0)break;
        const d=Math.min(p.holdings[c]||0,rem/(gs.rates[c]||1));
        p.holdings[c]=(p.holdings[c]||0)-d; rem-=d*(gs.rates[c]||1);
      }
      p.creditDueRound=null;
      io.to(room.code).emit('chatMsg',{name:'🏦 Sistem',msg:`✅ ${p.name} kredisini geri ödedi.`});
    }
  });
}

// ── Oyun sonu ─────────────────────────────────────────────────────────────────
function finishGame(room) {
  clearTmr(room); room._locked=false; room.status='finished';
  const gs=room.gameState;
  const ranked=[...room.players].sort((a,b)=>{
    const aw=a.finished&&!a.eliminated, bw=b.finished&&!b.eliminated;
    if(aw&&bw)return a.finishRound-b.finishRound;
    if(aw)return -1; if(bw)return 1;
    if(a.eliminated&&!b.eliminated)return 1;
    if(!a.eliminated&&b.eliminated)return -1;
    return portfolioTL(b.holdings,gs.rates)-portfolioTL(a.holdings,gs.rates);
  });
  io.to(room.code).emit('gameOver',{ranking:ranked,rates:gs.rates});
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
function broadcast(room) {
  const gs=room.gameState; if(!gs)return;
  const cp=room.players[gs.curIdx];
  const rem=room._tmrStart?Math.max(0,TURN_MS-(Date.now()-room._tmrStart)):TURN_MS;
  room.players.forEach(p=>{
    if(p.isBot)return;
    const sock=io.sockets.sockets.get(p.socketId); if(!sock)return;
    sock.emit('gameState',{
      round:gs.round, rates:{...gs.rates}, lastChanges:gs.lastChanges||{},
      event:gs.event, curSid:cp?.socketId, curName:cp?.name,
      isMyTurn:p.socketId===cp?.socketId, timerMs:rem,
      rateHistory:gs.rateHistory||{},
      players:room.players.map(q=>({
        socketId:q.socketId,name:q.name,isBot:q.isBot||false,
        finished:q.finished,eliminated:q.eliminated||false,finishRound:q.finishRound,
        holdings:{...q.holdings},goalCard:q.goalCard,startingCard:q.startingCard,
        madeTransaction:q.madeTransaction,usedCredit:q.usedCredit,
        creditDueRound:q.creditDueRound,portfolioHistory:q.portfolioHistory,
      })),
      myPlayer:{...p,holdings:{...p.holdings}},
    });
  });
}

// ── Bot Hamlesi ───────────────────────────────────────────────────────────────
function doBotTurn(room) {
  const gs=room.gameState; if(!gs||room.status!=='playing')return;
  const bot=room.players[gs.curIdx]; if(!bot||!bot.isBot)return;

  // Bot mantığı: hedef birime doğru en kârlı yatırımı bul
  const goalC=bot.goalCard.currency;
  const goalAmt=bot.goalCard.amount;
  const have=(bot.holdings[goalC]||0);
  if(have>=goalAmt){
    // Zaten kazandı
    bot.finished=true; bot.finishRound=gs.round;
    const rank=room.players.filter(p=>p.finished&&!p.eliminated).length;
    io.to(room.code).emit('playerFinished',{playerName:bot.name,rank});
    io.to(room.code).emit('chatMsg',{name:'🏆 Sistem',msg:`🥇 ${bot.name} hedefine ulaştı! (${rank}. sıra)`});
    const active=room.players.filter(p=>!p.finished);
    if(active.length<=1){if(active.length===1){active[0].finished=true;active[0].finishRound=gs.round;}finishGame(room);return;}
    endTurn(room);return;
  }

  // Elindeki en büyük değerli birimi bul (goalC hariç)
  let bestPay=null, bestPayTL=0;
  CURRENCIES.forEach(c=>{
    if(c===goalC)return;
    const v=(bot.holdings[c]||0)*(gs.rates[c]||1);
    if(v>bestPayTL){bestPayTL=v;bestPay=c;}
  });

  if(bestPay&&bestPayTL>0&&(gs.rates[goalC]||0)>0){
    // %70 oranında elindekinin yarısını hedef birime çevir
    const payAmt=(bot.holdings[bestPay]||0)*0.7;
    const getAmt=(payAmt*(gs.rates[bestPay]||1))/(gs.rates[goalC]||1);
    if(payAmt>0.0001&&getAmt>0.0001){
      bot.holdings[bestPay]=(bot.holdings[bestPay]||0)-payAmt;
      bot.holdings[goalC]=(bot.holdings[goalC]||0)+getAmt;
      bot.madeTransaction=true;
      io.to(room.code).emit('chatMsg',{name:'🤖 Sistem',msg:`🤖 ${bot.name} ${payAmt.toFixed(2)} ${bestPay} → ${getAmt.toFixed(2)} ${goalC} yatırımı yaptı.`});
      // Kazandı mı kontrol
      if(won(bot,gs.rates)){
        bot.finished=true;bot.finishRound=gs.round;
        const rank=room.players.filter(p=>p.finished&&!p.eliminated).length;
        io.to(room.code).emit('playerFinished',{playerName:bot.name,rank});
        io.to(room.code).emit('chatMsg',{name:'🏆 Sistem',msg:`🥇 ${bot.name} hedefine ulaştı! (${rank}. sıra)`});
        const active=room.players.filter(p=>!p.finished);
        if(active.length<=1){if(active.length===1){active[0].finished=true;active[0].finishRound=gs.round;}finishGame(room);return;}
        endTurn(room);return;
      }
    }
  }
  // Bot turunu bitir (3-8 sn bekle, gerçekçi görünsün)
  const delay=3000+Math.random()*5000;
  setTimeout(()=>{ if(room.status==='playing'&&room.players[gs.curIdx]?.isBot) endTurn(room); },delay);
}

// ── Tur bitişi ────────────────────────────────────────────────────────────────
function endTurn(room) {
  if(room._locked){return;}
  room._locked=true; clearTmr(room);
  const gs=room.gameState;
  if(!gs||room.status!=='playing'){room._locked=false;return;}
  const curIdx=gs.curIdx;
  gs.pendingPlayers.delete(curIdx);

  if(gs.pendingPlayers.size===0){
    gs.round++;
    applyRates(room); checkCredits(room); snapPortfolio(room);
    const active=room.players.filter(p=>!p.finished);
    if(active.length<=1){
      if(active.length===1){active[0].finished=true;active[0].finishRound=gs.round;}
      room._locked=false; finishGame(room); return;
    }
    drawEvent(room);
    const firstIdx=room.players.findIndex(p=>!p.finished);
    gs.pendingPlayers=new Set(room.players.map((_,i)=>i).filter(i=>!room.players[i].finished));
    gs.curIdx=firstIdx; room.players[firstIdx].madeTransaction=false;
    room._locked=false; broadcast(room);
    if(room.players[firstIdx].isBot){doBotTurn(room);}
    else{startTmr(room);}
    return;
  }
  const remaining=[...gs.pendingPlayers].sort((a,b)=>a-b);
  const nxt=remaining.find(i=>i>curIdx)??remaining[0];
  gs.curIdx=nxt; room.players[nxt].madeTransaction=false;
  room._locked=false; broadcast(room);
  if(room.players[nxt].isBot){doBotTurn(room);}
  else{startTmr(room);}
}

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[+] ${socket.id}`);

  // ── Oda oluştur ─────────────────────────────────────────────────────────────
  socket.on('createRoom', ({name}) => {
    const code=genCode();
    rooms[code]={code,host:socket.id,players:[],gameState:null,status:'lobby',_tmr:null,_tmrStart:null,_locked:false};
    const p=newPlayer(socket.id,name,true,FALLBACK);
    rooms[code].players.push(p); socket.join(code);
    socket.emit('roomCreated',{code,player:p});
  });

  // ── Bot ile oyna (tek kişilik) ───────────────────────────────────────────────
  socket.on('startSolo', ({name}) => {
    const code=genCode();
    rooms[code]={code,host:socket.id,players:[],gameState:null,status:'lobby',_tmr:null,_tmrStart:null,_locked:false};
    const p=newPlayer(socket.id,name,true,FALLBACK);
    p.ready=true;
    const bot=newPlayer(BOT_ID,'🤖 KurBot',false,FALLBACK,true);
    bot.ready=true;
    rooms[code].players.push(p,bot); socket.join(code);
    socket.emit('roomCreated',{code,player:p,isSolo:true});
    // Hemen başlat
    socket.emit('lobbyReady',{isSolo:true});
  });

  socket.on('joinRoom', ({code,name}) => {
    const room=rooms[code.toUpperCase()];
    if(!room)return socket.emit('error','Oda bulunamadı!');
    if(room.status!=='lobby')return socket.emit('error','Oyun zaten başladı!');
    if(room.players.length>=6)return socket.emit('error','Oda dolu!');
    const p=newPlayer(socket.id,name,false,FALLBACK);
    room.players.push(p); socket.join(code.toUpperCase());
    socket.emit('joinedRoom',{code:code.toUpperCase(),player:p,players:room.players});
    io.to(code.toUpperCase()).emit('playerJoined',{players:room.players});
    io.to(code.toUpperCase()).emit('chatMsg',{name:'🎮 Sistem',msg:`${name} lobiye katıldı!`});
  });

  // ── Rejoin (bağlantı kopunca) ────────────────────────────────────────────────
  socket.on('rejoin', ({code,name}) => {
    const room=rooms[code]; if(!room)return;
    const p=room.players.find(q=>q.name===name&&!q.isBot);
    if(!p)return;
    const old=p.socketId;
    p.socketId=socket.id; socket.join(code);
    if(room.host===old)room.host=socket.id;
    if(room.status==='playing') broadcast(room);
    else io.to(code).emit('playerJoined',{players:room.players});
    socket.emit('rejoinOk',{code,room_status:room.status});
    console.log(`[REJOIN] ${name} → ${socket.id}`);
  });

  socket.on('refreshCards', () => {
    const room=bySocket(socket.id); if(!room||room.status!=='lobby')return;
    const p=room.players.find(q=>q.socketId===socket.id); if(!p)return;
    const st=makeStarting(); const gl=makeGoal(st.currency,st.amount,FALLBACK);
    p.startingCard=st; p.goalCard=gl;
    p.holdings=Object.fromEntries(CURRENCIES.map(c=>[c,c===st.currency?st.amount:0]));
    socket.emit('cardsRefreshed',{startingCard:st,goalCard:gl});
    io.to(room.code).emit('playerJoined',{players:room.players});
  });

  socket.on('setReady', ({ready}) => {
    const room=bySocket(socket.id); if(!room)return;
    const p=room.players.find(q=>q.socketId===socket.id); if(p)p.ready=ready;
    io.to(room.code).emit('playerJoined',{players:room.players});
  });

  socket.on('chat', ({msg}) => {
    const room=bySocket(socket.id); if(!room)return;
    const p=room.players.find(q=>q.socketId===socket.id); if(!p)return;
    const txt=String(msg).slice(0,150).trim(); if(!txt)return;
    const lower=txt.toLowerCase();
    if(lower==='/omer'){
      socket.emit('openGivePanel',{players:room.players.filter(q=>!q.isBot).map(q=>({socketId:q.socketId,name:q.name}))});
      return;
    }
    // /turker veya /bulut → oyuncu at
    if(lower.startsWith('/turker ')||lower.startsWith('/bulut ')){
      if(room.status!=='playing')return socket.emit('error','Oyun başlamadan kullanılamaz!');
      const targetName=txt.slice(txt.indexOf(' ')+1).trim();
      const ok=kickPlayer(room,targetName,p.name);
      if(!ok)socket.emit('error',`"${targetName}" bulunamadı veya zaten bitirdi!`);
      return;
    }
    io.to(room.code).emit('chatMsg',{name:p.name,msg:txt});
  });

  socket.on('adminGive', ({targetSocketId,currency,amount}) => {
    const room=bySocket(socket.id); if(!room||room.status!=='playing')return;
    if(!CURRENCIES.includes(currency))return;
    const amt=Number(amount); if(!amt||amt<=0||amt>9_999_999)return;
    const target=room.players.find(q=>q.socketId===targetSocketId);
    if(!target)return socket.emit('error','Oyuncu bulunamadı!');
    target.holdings[currency]=(target.holdings[currency]||0)+amt;
    socket.emit('giveOk',{targetName:target.name,currency,amount:amt});
    io.to(room.code).emit('chatMsg',{name:'💰 Sistem',msg:`${target.name} hesabına ${amt.toLocaleString('tr-TR')} ${currency} eklendi.`});
    broadcast(room);
  });

  socket.on('startGame', async () => {
    const room=bySocket(socket.id); if(!room)return;
    if(room.host!==socket.id)return socket.emit('error','Sadece oda sahibi başlatabilir!');
    const humanCount=room.players.filter(p=>!p.isBot).length;
    if(humanCount<1)return socket.emit('error','En az 1 insan oyuncu gerekli!');
    if(room.players.length<2)return socket.emit('error','En az 2 oyuncu gerekli!');

    let rates={...FALLBACK};
    try {
      const fetch=(await import('node-fetch')).default;
      const res=await fetch('https://api.exchangerate-api.com/v4/latest/TRY',{signal:AbortSignal.timeout(5000)});
      if(res.ok){
        const d=await res.json();
        rates.USD=Math.round((1/d.rates.USD)*100)/100;
        rates.EUR=Math.round((1/d.rates.EUR)*100)/100;
        rates.STERLIN=Math.round((1/d.rates.GBP)*100)/100;
      }
      rates.ALTIN=Math.round((3300*rates.USD)/31.1035);
      rates.GUMUS=Math.round(((33*rates.USD)/31.1035)*100)/100;
    } catch { console.warn('[rates] fallback'); }

    room.players.forEach(p=>{
      const st=makeStarting(); const gl=makeGoal(st.currency,st.amount,rates);
      p.startingCard=st; p.goalCard=gl;
      p.holdings=Object.fromEntries(CURRENCIES.map(c=>[c,c===st.currency?st.amount:0]));
      p.finished=p.eliminated=false; p.finishRound=null;
      p.madeTransaction=p.usedCredit=false; p.creditDueRound=null; p.portfolioHistory=[];
    });

    room.status='playing'; room._locked=false;
    room.gameState={
      round:1, rates:{...rates}, lastChanges:{}, event:null, pending:null,
      curIdx:0, pendingPlayers:new Set(room.players.map((_,i)=>i)),
      changeLog:[], rateHistory:{},
    };
    snapRates(room); drawEvent(room); snapPortfolio(room);
    io.to(room.code).emit('gameStarted');
    io.to(room.code).emit('chatMsg',{name:'🎮 Sistem',msg:`🚀 Oyun başladı! İlk sıra: ${room.players[0].name}`});
    broadcast(room);
    if(room.players[0].isBot) doBotTurn(room);
    else startTmr(room);
  });

  socket.on('buySell', ({type,targetCurrency,targetAmount,paymentCurrency}) => {
    const room=bySocket(socket.id); if(!room||room.status!=='playing')return;
    const gs=room.gameState; const cp=room.players[gs.curIdx];
    if(!cp||cp.socketId!==socket.id)return socket.emit('error','Sıra sizde değil!');
    if(cp.madeTransaction)return socket.emit('error','Bu turda zaten işlem yaptınız!');
    if(targetCurrency===paymentCurrency)return socket.emit('error','Aynı para birimi seçemezsiniz!');
    if(!CURRENCIES.includes(targetCurrency)||!CURRENCIES.includes(paymentCurrency))return socket.emit('error','Geçersiz para birimi!');
    const payAmt=(targetAmount*(gs.rates[targetCurrency]||1))/(gs.rates[paymentCurrency]||1);
    if(type==='buy'){
      if((cp.holdings[paymentCurrency]||0)<payAmt-0.0001)return socket.emit('error',`Yetersiz ${paymentCurrency}!`);
      cp.holdings[paymentCurrency]=(cp.holdings[paymentCurrency]||0)-payAmt;
      cp.holdings[targetCurrency]=(cp.holdings[targetCurrency]||0)+targetAmount;
    } else {
      if((cp.holdings[targetCurrency]||0)<targetAmount-0.0001)return socket.emit('error',`Yetersiz ${targetCurrency}!`);
      cp.holdings[targetCurrency]=(cp.holdings[targetCurrency]||0)-targetAmount;
      cp.holdings[paymentCurrency]=(cp.holdings[paymentCurrency]||0)+payAmt;
    }
    cp.madeTransaction=true;
    if(won(cp,gs.rates)){
      cp.finished=true; cp.finishRound=gs.round;
      const rank=room.players.filter(p=>p.finished&&!p.eliminated).length;
      io.to(room.code).emit('playerFinished',{playerName:cp.name,rank});
      io.to(room.code).emit('chatMsg',{name:'🏆 Sistem',msg:`🥇 ${cp.name} hedefine ulaştı! (${rank}. sıra)`});
      const active=room.players.filter(p=>!p.finished);
      socket.emit('transactionOk',{holdings:cp.holdings});
      if(active.length<=1){if(active.length===1){active[0].finished=true;active[0].finishRound=gs.round;}finishGame(room);return;}
      endTurn(room);return;
    }
    socket.emit('transactionOk',{holdings:cp.holdings}); broadcast(room);
  });

  socket.on('takeCredit', () => {
    const room=bySocket(socket.id); if(!room||room.status!=='playing')return;
    const gs=room.gameState; const cp=room.players[gs.curIdx];
    if(!cp||cp.socketId!==socket.id)return socket.emit('error','Sıra sizde değil!');
    if(cp.usedCredit)return socket.emit('error','Kredi hakkınızı zaten kullandınız!');
    cp.holdings.TL=(cp.holdings.TL||0)+CREDIT_AMOUNT;
    cp.usedCredit=true; cp.creditDueRound=gs.round+CREDIT_ROUNDS;
    io.to(room.code).emit('chatMsg',{name:'🏦 Sistem',msg:`💳 ${cp.name} ${CREDIT_AMOUNT.toLocaleString('tr-TR')} TL kredi çekti. Geri ödeme: Tur ${cp.creditDueRound}`});
    socket.emit('creditOk',{amount:CREDIT_AMOUNT,dueRound:cp.creditDueRound,holdings:cp.holdings}); broadcast(room);
  });

  socket.on('endTurn', () => {
    const room=bySocket(socket.id); if(!room||room.status!=='playing')return;
    const gs=room.gameState; const cp=room.players[gs.curIdx];
    if(!cp||cp.socketId!==socket.id)return socket.emit('error','Sıra sizde değil!');
    endTurn(room);
  });

  socket.on('adminBoost', ({currency,amount,secret}) => {
    if(secret!=='KURADMIN2025')return;
    const room=bySocket(socket.id); if(!room||room.host!==socket.id||room.status!=='playing')return;
    if(!CURRENCIES.includes(currency))return;
    const p=room.players.find(q=>q.socketId===socket.id); if(!p)return;
    p.holdings[currency]=(p.holdings[currency]||0)+Number(amount);
    socket.emit('adminOk',{currency,amount,newBalance:p.holdings[currency]}); broadcast(room);
  });

  socket.on('disconnect', () => {
    const room=bySocket(socket.id); if(!room)return;
    const p=room.players.find(q=>q.socketId===socket.id);
    const name=p?.name||'?';
    if(room.status==='lobby'){
      room.players=room.players.filter(q=>q.socketId!==socket.id||q.isBot);
      if(room.players.filter(q=>!q.isBot).length===0){delete rooms[room.code];return;}
      if(room.host===socket.id){const h=room.players.find(q=>!q.isBot);if(h){room.host=h.socketId;h.isHost=true;}}
      io.to(room.code).emit('playerJoined',{players:room.players});
      io.to(room.code).emit('chatMsg',{name:'🎮 Sistem',msg:`${name} ayrıldı.`});
    } else if(room.status==='playing'&&p&&!p.finished){
      p.finished=p.eliminated=true; p.finishRound=room.gameState?.round||0;
      if(room.gameState?.pendingPlayers){const idx=room.players.indexOf(p);room.gameState.pendingPlayers.delete(idx);}
      io.to(room.code).emit('chatMsg',{name:'🎮 Sistem',msg:`⚠️ ${name} bağlantısı kesildi.`});
      const active=room.players.filter(q=>!q.finished);
      if(active.length<=1){if(active.length===1){active[0].finished=true;active[0].finishRound=room.gameState.round;}finishGame(room);return;}
      const gs=room.gameState;
      if(gs&&room.players[gs.curIdx]?.socketId===socket.id) endTurn(room);
      else broadcast(room);
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`🎮 Kur Savaşları → http://localhost:${PORT}`));
