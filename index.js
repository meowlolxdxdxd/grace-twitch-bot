const tmi = require('tmi.js');
const admin = require('firebase-admin');
const sharp = require('sharp');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// ========== Firebase ==========
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) { console.error('❌ Нет FIREBASE_SERVICE_ACCOUNT_JSON'); process.exit(1); }
let serviceAccount;
try { serviceAccount = JSON.parse(serviceAccountJson); } catch (e) { console.error('❌ Ошибка парсинга JSON:', e.message); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: "https://jessew1lliams-obs-overlay-default-rtdb.firebaseio.com" });
const db = admin.database();
console.log('✅ Firebase');

// ========== Supabase ==========
const SUPABASE_URL = "https://pxbpqxvegeywdaytaqgp.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4YnBxeHZlZ2V5d2RheXRhcWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTAwMjgsImV4cCI6MjA5NzM2NjAyOH0.PfSsQupiA7mmWF4mjjaZ86Prs2oHZ5A5-mvG2HenEDo";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========== Конфигурация ==========
const TWITCH_CHANNEL = "meowlolxdxdxd";
const BOT_USERNAME = "meowlolxdxdxd";
const OAUTH_TOKEN = process.env.TWITCH_OAUTH_TOKEN || "";
if (!OAUTH_TOKEN) { console.error('❌ Нет TWITCH_OAUTH_TOKEN'); process.exit(1); }
const ROOM_ID = process.env.ROOM_ID || "-OvMNH8xsdICOW0tzqa7";
const QR_PERMISSION = (process.env.QR_PERMISSION || "all").toLowerCase();

// Заголовки браузера
const browserHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'image/png,image/*;q=0.8'
};

// Проверка, что буфер является PNG (первые 8 байт)
function isPNG(buffer) {
  if (!buffer || buffer.length < 8) return false;
  return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
}

// Проверка, что буфер является JPEG
function isJPEG(buffer) {
  if (!buffer || buffer.length < 3) return false;
  return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
}

// ========== Генерация картинки ==========
async function generateTelegramStyleQR(url) {
  // --- 1. QR-код (пытаемся Telegram, иначе запасной) ---
  let qrBuffer = null;
  try {
    const tgQrUrl = `https://t.me/qrcode?url=${encodeURIComponent(url)}`;
    console.log('Запрашиваю QR у Telegram:', tgQrUrl);
    const res = await fetch(tgQrUrl, { headers: browserHeaders });
    if (res.ok) {
      const buf = await res.buffer();
      if (isPNG(buf) || isJPEG(buf)) {
        qrBuffer = buf;
        console.log('✅ Получен QR от Telegram');
      } else {
        console.warn('Telegram вернул не изображение, использую запасной генератор');
      }
    }
  } catch (e) {
    console.warn('Ошибка Telegram QR, использую запасной:', e.message);
  }

  if (!qrBuffer) {
    const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}&bgcolor=255-255-255&color=0-0-0&format=png&eye=frame13&body=circle`;
    console.log('Использую fallback QR:', fallbackUrl);
    const res = await fetch(fallbackUrl, { headers: browserHeaders });
    if (!res.ok) throw new Error(`Fallback QR error ${res.status}`);
    qrBuffer = await res.buffer();
    console.log('✅ Получен fallback QR');
  }

  // --- 2. Аватарка канала (если публичный) ---
  let avatarBuffer = null;
  try {
    const u = new URL(url);
    if (u.hostname === 't.me' || u.hostname === 'telegram.me') {
      const username = u.pathname.replace(/\//g, '');
      const avatarUrl = `https://t.me/i/userpic/320/${username}.jpg`;
      const res = await fetch(avatarUrl, { headers: browserHeaders });
      if (res.ok) {
        const buf = await res.buffer();
        if (isJPEG(buf) || isPNG(buf)) avatarBuffer = buf;
      }
    }
  } catch (e) {}
  if (!avatarBuffer) {
    try {
      const res = await fetch('https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/240px-Telegram_logo.svg.png', { headers: browserHeaders });
      if (res.ok) avatarBuffer = await res.buffer();
    } catch (e) {}
  }

  // --- 3. Ник ---
  let nickname = 'Telegram';
  try {
    const u = new URL(url);
    if (u.hostname === 't.me' || u.hostname === 'telegram.me') {
      nickname = '@' + u.pathname.replace(/\//g, '');
    }
  } catch (e) {}

  // --- 4. Сборка ---
  const width = 500, height = 600;
  const avatarSize = avatarBuffer ? 100 : 0;
  const qrSize = 300;
  const avatarTop = 30;
  const qrTop = avatarSize > 0 ? (avatarTop + avatarSize + 30) : 60;

  const composites = [];

  // Аватарка
  if (avatarBuffer) {
    const resizedAvatar = await sharp(avatarBuffer).resize(avatarSize, avatarSize).png().toBuffer();
    composites.push({
      input: resizedAvatar,
      top: avatarTop,
      left: Math.round((width - avatarSize) / 2)
    });
  }

  // QR-код
  const resizedQR = await sharp(qrBuffer).resize(qrSize, qrSize).png().toBuffer();
  composites.push({
    input: resizedQR,
    top: qrTop,
    left: Math.round((width - qrSize) / 2)
  });

  // Создаём базовое изображение
  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#ffffff'
    }
  }).composite(composites);

  // Добавляем текст (ник) через SVG overlay
  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="60">
      <text x="50%" y="40" font-size="24" font-family="Arial, sans-serif" font-weight="bold" fill="#000000" text-anchor="middle">${nickname}</text>
    </svg>
  `);

  return base
    .composite([{ input: textSvg, top: height - 70, left: 0 }])
    .png()
    .toBuffer();
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
    console.log('🎨 Генерирую картинку...');
    const imgBuffer = await generateTelegramStyleQR(url);
    console.log('⬆️ Загружаю в Supabase...');

    const filename = `qr-${Date.now()}.png`;
    const { data, error } = await supabase.storage
      .from('overlay')
      .upload(`tts/${filename}`, imgBuffer, { contentType: 'image/png', upsert: true });

    if (error) throw error;

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/overlay/tts/${filename}`;
    console.log('✅ Картинка загружена:', publicUrl);

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
    console.log('✅ QR добавлен в оверлей');

    setTimeout(() => {
      newItemRef.remove().catch(() => {});
      supabase.storage.from('overlay').remove([`tts/${filename}`]).catch(() => {});
    }, 15000);
  } catch (e) {
    console.error('❌ Ошибка генерации:', e.message);
  }
});

client.on('disconnected', (reason) => console.log('🔌', reason));
