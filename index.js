const tmi = require('tmi.js');
const admin = require('firebase-admin');

// Получаем содержимое service-account.json из переменной окружения
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  console.error('❌ Переменная FIREBASE_SERVICE_ACCOUNT_JSON не задана');
  process.exit(1);
}
const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jessew1lliams-obs-overlay-default-rtdb.firebaseio.com"
});
const db = admin.database();

// Настройки Twitch (токен тоже из переменной окружения)
const TWITCH_CHANNEL = "meowlolxdxdxd";
const BOT_USERNAME = "meowlolxdxdxd";
const OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN || "";
if (!OAUTH_TOKEN) {
  console.error('❌ Переменная TWITCH_OAUTH_TOKEN не задана');
  process.exit(1);
}

const ROOM_ID = "-OvMNH8xsdICOW0tzqa7";

const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [TWITCH_CHANNEL]
});
client.connect().catch(console.error);

client.on('message', (channel, tags, message, self) => {
  if (self) return;

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
    .catch(console.error);
});
