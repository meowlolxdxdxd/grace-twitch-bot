const tmi = require('tmi.js');
const admin = require('firebase-admin');

// Получаем содержимое service-account.json из переменной окружения
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('❌ Переменная FIREBASE_SERVICE_ACCOUNT_JSON не задана');
  process.exit(1);
}
let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch (e) {
  console.error('❌ Ошибка разбора JSON из FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jessew1lliams-obs-overlay-default-rtdb.firebaseio.com"
});
const db = admin.database();
console.log('✅ Firebase инициализирован');

// Настройки Twitch
const TWITCH_CHANNEL = "meowlolxdxdxd";
const BOT_USERNAME = "meowlolxdxdxd";
const OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN || "";
if (!OAUTH_TOKEN) {
  console.error('❌ Переменная TWITCH_OAUTH_TOKEN не задана');
  process.exit(1);
}
console.log('✅ Токен Twitch загружен, пытаюсь подключиться...');

const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [TWITCH_CHANNEL]
});

client.connect().then(() => {
  console.log('✅ Бот подключён к чату канала ' + TWITCH_CHANNEL);
}).catch((err) => {
  console.error('❌ Ошибка подключения к Twitch:', err.message);
  process.exit(1);
});

client.on('message', (channel, tags, message, self) => {
  if (self) return;
  console.log(`📩 Получено сообщение от ${tags.username}: ${message}`);

  const parts = message.trim().split(' ');
  if (parts.length < 2 || parts[0].toLowerCase() !== '!qr') return;

  const url = parts.slice(1).join(' ');
  if (!url.startsWith('http')) {
    console.log('❌ Некорректная ссылка');
    return;
  }

  const qrImageUrl = `https://chart.googleapis.com/chart?chs=400x400&cht=qr&chl=${encodeURIComponent(url)}&choe=UTF-8`;

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
      console.log('✅ QR-код добавлен');
      setTimeout(() => {
        newItemRef.remove()
          .then(() => console.log('🗑️ QR-код удалён'))
          .catch(console.error);
      }, 15000);
    })
    .catch((err) => {
      console.error('❌ Ошибка записи в Firebase:', err.message);
    });
});

client.on('connected', (address, port) => {
  console.log(`🔗 Подключён к IRC-серверу ${address}:${port}`);
});

client.on('disconnected', (reason) => {
  console.log('🔌 Отключён от чата, причина:', reason);
});
