const tmi = require('tmi.js');
const admin = require('firebase-admin');
const { createCanvas, loadImage } = require('canvas');
const fetch = require('node-fetch');
const { Readable } = require('stream');

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
const SUPABASE_URL = "https://pxbpqxvegeywdaytaqgp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."; // укажи свой анон-ключ (или используем переменную)

// ========== Супер-функция генерации картинки ==========
async function generateTelegramStyleQR(url) {
  // 1. Получаем аватарку (если канал публичный)
  let avatarUrl = '';
  try {
    const u = new URL(url);
    if (u.hostname === 't.me' || u.hostname === 'telegram.me') {
      const username = u.pathname.replace(/\//g, '');
      avatarUrl = `https://t.me/i/userpic/320/${username}.jpg`;
    }
  } catch (e) {}

  // 2. Генерируем QR-код (простой)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}`;

  // 3. Рисуем всё на canvas (500x600)
  const canvas = createCanvas(500, 600);
  const ctx = canvas.getContext('2d');

  // Фон
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 500, 600);

  // Аватарка (сверху)
  try {
    const avatarImg = await loadImage(avatarUrl);
    const avatarSize = 100;
    ctx.drawImage(avatarImg, (500 - avatarSize) / 2, 30, avatarSize, avatarSize);
  } catch (e) {
    // Fallback – иконка Telegram
    try {
      const tgLogo = await loadImage('https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/240px-Telegram_logo.svg.png');
      const avatarSize = 100;
      ctx.drawImage(tgLogo, (500 - avatarSize) / 2, 30, avatarSize, avatarSize);
    } catch (e2) {}
  }

  // QR-код (по центру)
  const qrImg = await loadImage(qrUrl);
  ctx.drawImage(qrImg, (500 - 300) / 2, 160, 300, 300);

  // Ник (снизу)
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.textAlign = 'center';
  let nickname = '';
  try {
    const u = new URL(url);
    if (u.hostname === 't.me' || u.hostname === 'telegram.me') {
      nickname = '@' + u.pathname.replace(/\//g, '');
    }
  } catch (e) {}
  if (!nickname) nickname = 'Telegram';
  ctx.fillText(nickname, 250, 540);

  return canvas.toBuffer('image/png');
}

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

  try {
    // Генерируем картинку
    const imgBuffer = await generateTelegramStyleQR(url);

    // Загружаем в Supabase Storage
    const filename = `qr-${Date.now()}.png`;
    const { createClient } = require('@supabase/supabase-js'); // быстрый импорт, чтобы не возиться с отдельным require
    const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4YnBxeHZlZ2V5d2RheXRhcWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTAwMjgsImV4cCI6MjA5NzM2NjAyOH0.PfSsQupiA7mmWF4mjjaZ86Prs2oHZ5A5-mvG2HenEDo');
    const { data, error } = await supabase.storage.from('overlay').upload(`tts/${filename}`, imgBuffer, { contentType: 'image/png', upsert: true });
    if (error) throw error;
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/overlay/tts/${filename}`;

    // Добавляем элемент в Firebase
    const qrItem = {
      type: "image",
      title: "Telegram QR",
      url: publicUrl,
      visible: true,
      position: { top: 540, left: 960 },
      size: { width: 500, height: 600 },
      rotation: 0,
      playing: false,
      volume: 1
    };
    const newItemRef = db.ref(`overlay/rooms/${ROOM_ID}/items`).push();
    await newItemRef.set(qrItem);
    console.log('✅ QR добавлен');
    setTimeout(() => { newItemRef.remove().catch(()=>{}); }, 15000);
  } catch (e) {
    console.error('❌ Ошибка генерации:', e.message);
  }
});

client.on('disconnected', (reason) => console.log('🔌', reason));
