const tmi = require('tmi.js');
const admin = require('firebase-admin');

// Подключаем Firebase Admin
const serviceAccount = require('./service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jessew1lliams-obs-overlay-default-rtdb.firebaseio.com"
});
const db = admin.database();

// Настройки Twitch (токен уже вставлен)
const TWITCH_CHANNEL = "meowlolxdxdxd";
const BOT_USERNAME = "meowlolxdxdxd";
const OAUTH_TOKEN = "oauth:fj3a3czhba6mfq4wa4ra8r8jahstaz";  // твой Access Token

// Комната оверлея (основная)
const ROOM_ID = "-OvMNH8xsdICOW0tzqa7";

// Подключаемся к чату
const client = new tmi.Client({
  options: { debug: false },
  identity: {
    username: BOT_USERNAME,
    password: OAUTH_TOKEN
  },
  channels: [TWITCH_CHANNEL]
});
client.connect().catch(console.error);

// Слушаем сообщения
client.on('message', (channel, tags, message, self) => {
  if (self) return; // игнорируем свои сообщения

  const parts = message.trim().split(' ');
  if (parts.length < 2 || parts[0].toLowerCase() !== '!qr') return;

  const url = parts.slice(1).join(' '); // ссылка
  if (!url.startsWith('http')) {
    console.log('❌ Некорректная ссылка');
    return;
  }

  // Генерируем QR-код через Google Charts
  const qrImageUrl = `https://chart.googleapis.com/chart?chs=400x400&cht=qr&chl=${encodeURIComponent(url)}&choe=UTF-8`;

  const qrItem = {
    type: "image",
    title: "QR-код",
    url: qrImageUrl,
    visible: true,
    position: { top: 540, left: 960 }, // центр экрана 1920x1080
    size: { width: 400, height: 400 },
    rotation: 0,
    playing: false,
    volume: 1
  };

  // Добавляем элемент в Firebase
  const newItemRef = db.ref(`overlay/rooms/${ROOM_ID}/items`).push();
  newItemRef.set(qrItem)
    .then(() => {
      console.log('✅ QR-код добавлен');
      // Удаляем через 15 секунд
      setTimeout(() => {
        newItemRef.remove()
          .then(() => console.log('🗑️ QR-код удалён'))
          .catch(console.error);
      }, 15000);
    })
    .catch(console.error);
});