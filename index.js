const tmi = require('tmi.js');
const admin = require('firebase-admin');

// --- 1. Firebase ---
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('❌ Нет переменной FIREBASE_SERVICE_ACCOUNT_JSON');
  process.exit(1);
}
let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (e) {
  console.error('❌ Ошибка парсинга JSON из переменной FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jessew1lliams-obs-overlay-default-rtdb.firebaseio.com"
});
const db = admin.database();
console.log('✅ Firebase инициализирован');

// --- 2. Twitch ---
const TWITCH_CHANNEL = "meowlolxdxdxd";
const BOT_USERNAME = "meowlolxdxdxd";
const OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN || "";
if (!OAUTH_TOKEN) {
  console.error('❌ Нет переменной TWITCH_OAUTH_TOKEN');
  process.exit(1);
}

// --- 3. Комната оверлея ---
const ROOM_ID = process.env.ROOM_ID || "-OvMNH8xsdICOW0tzqa7";
console.log('✅ Комната:', ROOM_ID);

// --- 4. Права доступа ---
// Возможные значения: all, vip, mod, vip+mod
const QR_PERMISSION = (process.env.QR_PERMISSION || "all").toLowerCase();
console.log('✅ Права для !qr:', QR_PERMISSION);

// --- 5. Подключение к чату ---
const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [TWITCH_CHANNEL]
});

client.connect()
  .then(() => console.log('✅ Бот подключён к чату', TWITCH_CHANNEL))
  .catch(err => {
    console.error('❌ Ошибка подключения к Twitch:', err.message);
    process.exit(1);
  });

client.on('connected', (addr, port) => {
  console.log(`🔗 IRC: ${addr}:${port}`);
});

// --- 6. Проверка прав ---
function hasPermission(tags) {
  if (QR_PERMISSION === 'all') return true;
  const badges = tags.badges || {};
  const isVip = badges.vip === '1';
  const isMod = badges.moderator === '1' || badges.broadcaster === '1';
  if (QR_PERMISSION === 'vip' && isVip) return true;
  if (QR_PERMISSION === 'mod' && isMod) return true;
  if (QR_PERMISSION === 'vip+mod' && (isVip || isMod)) return true;
  return false;
}

// --- 7. Обработка сообщений ---
client.on('message', (channel, tags, message, self) => {
  if (self) return;

  console.log(`📩 [${tags.username}] ${message}`);

  const parts = message.trim().split(' ');
  if (parts.length < 2 || parts[0].toLowerCase() !== '!qr') return;

  // Проверяем права
  if (!hasPermission(tags)) {
    console.log(`⛔ Нет прав у ${tags.username} (badges: ${JSON.stringify(tags.badges)})`);
    // Бот ничего не пишет в чат, просто игнорирует
    return;
  }

  const url = parts.slice(1).join(' ');
  if (!url.startsWith('http')) {
    console.log('❌ Некорректная ссылка в !qr');
    return;
  }

  // ✅ НОВЫЙ РАБОЧИЙ ГЕНЕРАТОР QR (api.qrserver.com)
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}`;
  console.log('🔗 QR-ссылка:', qrImageUrl);

  const qrItem = {
    type: "image",
    title: "QR-код",
    url: qrImageUrl,
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
      console.log('✅ QR-код добавлен в Firebase, ID:', newItemRef.key);
      setTimeout(() => {
        newItemRef.remove()
          .then(() => console.log('🗑️ QR-код удалён'))
          .catch(console.error);
      }, 15000);
    })
    .catch(err => {
      console.error('❌ Ошибка записи в Firebase:', err.message);
    });
});

// --- 8. Дисконнект ---
client.on('disconnected', (reason) => {
  console.log('🔌 Отключён от чата, причина:', reason);
});
