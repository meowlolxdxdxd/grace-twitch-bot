const tmi = require('tmi.js');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// ========== Firebase ==========
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) { console.error('❌ Нет FIREBASE_SERVICE_ACCOUNT_JSON'); process.exit(1); }
let serviceAccount;
try { serviceAccount = JSON.parse(serviceAccountJson); } catch (e) { console.error('❌ Ошибка парсинга JSON:', e.message); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: "https://jessew1lliams-obs-overlay-default-rtdb.firebaseio.com" });
const db = admin.database();
console.log('✅ Firebase');

// ========== Конфигурация ==========
const TWITCH_CHANNEL = "meowlolxdxdxd";
const BOT_USERNAME = "meowlolxdxdxd";
const OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN || "";
if (!OAUTH_TOKEN) { console.error('❌ Нет TWITCH_OAUTH_TOKEN'); process.exit(1); }
const ROOM_ID = process.env.ROOM_ID || "-OvMNH8xsdICOW0tzqa7";
const QR_PERMISSION = (process.env.QR_PERMISSION || "all").toLowerCase();

// ========== Twitch чат ==========
const client = new tmi.Client({
  options: { debug: false },
  identity: { username: BOT_USERNAME, password: OAUTH_TOKEN },
  channels: [TWITCH_CHANNEL]
});
client.connect().then(() => console.log('✅ Чат')).catch(err => { console.error('❌ Twitch:', err.message); process.exit(1); });

client.on('connected', (addr, port) => console.log(`🔗 ${addr}:${port}`));

client.on('message', async (channel, tags, message, self) => {
  if (self) return;
  console.log(`📩 [${tags.username}] ${message}`);

  const parts = message.trim().split(' ');
  if (parts.length < 2 || parts[0].toLowerCase() !== '!qr') return;

  // Права
  const badges = tags.badges || {};
  const isVip = badges.vip === '1';
  const isMod = badges.moderator === '1' || badges.broadcaster === '1';
  if (QR_PERMISSION === 'vip' && !isVip) return;
  if (QR_PERMISSION === 'mod' && !isMod) return;
  if (QR_PERMISSION === 'vip+mod' && !(isVip || isMod)) return;

  const url = parts.slice(1).join(' ');
  if (!url.startsWith('http')) { console.log('❌ Не ссылка'); return; }

  // Извлекаем ник для заголовка
  let title = 'QR-код';
  try {
    const u = new URL(url);
    if (u.hostname === 't.me' || u.hostname === 'telegram.me') {
      title = '@' + u.pathname.replace(/\//g, '');
    }
  } catch (e) {}

  // Генерируем QR через qrcode-monkey (стильный)
  const qrUrl = `https://api.qrcode-monkey.com/qr/custom?data=${encodeURIComponent(url)}&size=400&file=png&config=${encodeURIComponent(JSON.stringify({
    body: "circle",
    eye: "frame13",
    eyeBall: "ball14",
    bodyColor: "#0088cc",
    bgColor: "#ffffff"
  }))}`;

  console.log('🔗 QR:', qrUrl);

  const qrItem = {
    type: "image",
    title: title,
    url: qrUrl,
    visible: true,
    position: { top: 540, left: 960 },
    size: { width: 400, height: 400 },
    rotation: 0,
    playing: false,
    volume: 1
  };

  const newItemRef = db.ref(`overlay/rooms/${ROOM_ID}/items`).push();
  newItemRef.set(qrItem)
    .then(() => {
      console.log('✅ QR добавлен');
      setTimeout(() => {
        newItemRef.remove().catch(() => {});
      }, 15000);
    })
    .catch(err => console.error('❌ Firebase:', err.message));
});

client.on('disconnected', (reason) => console.log('🔌', reason));
