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

// ========== Генерация картинки (sharp) ==========
async function generateTelegramStyleQR(url) {
  // 1. Получаем официальный QR-код Telegram
  const tgQrUrl = `https://t.me/qrcode?url=${encodeURIComponent(url)}`;
  const qrRes = await fetch(tgQrUrl);
  if (!qrRes.ok) throw new Error(`Ошибка загрузки QR от Telegram: ${qrRes.status}`);
  const qrBuffer = await qrRes.buffer();

  // 2. Аватарка канала (если публичный)
  let avatarBuffer = null;
  try {
    const u = new URL(url);
    if (u.hostname === 't.me' || u.hostname === 'telegram.me') {
      const username = u.pathname.replace(/\//g, '');
      const avatarUrl = `https://t.me/i/userpic/320/${username}.jpg`;
      const res = await fetch(avatarUrl);
      if (res.ok) avatarBuffer = await res.buffer();
    }
  } catch (e) {}
  // fallback – иконка Telegram
  if (!avatarBuffer) {
    try {
      const res = await fetch('https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/240px-Telegram_logo.svg.png');
      if (res.ok) avatarBuffer = await res.buffer();
    } catch (e) {}
  }

  // 3. Ник
  let nickname = 'Telegram';
  try {
    const u = new URL(url);
    if (u.hostname === 't.me' || u.hostname === 'telegram.me') {
      nickname = '@' + u.pathname.replace(/\//g, '');
    }
  } catch (e) {}

  // Создаём текстовый слой (SVG)
  const svgText = `<svg width="500" height="60"><text x="50%" y="40" font-size="24" font-family="Arial" font-weight="bold" fill="black" text-anchor="middle">${nickname}</text></svg>`;

  // Сборка итоговой картинки 500x600
  const layers = [];
  // фон (белый)
  layers.push({ input: { create: { width: 500, height: 600, channels: 3, background: '#ffffff' } } });

  // аватарка (100x100) сверху по центру
  if (avatarBuffer) {
    layers.push({ input: avatarBuffer, top: 30, left: Math.round((500 - 100) / 2), width: 100, height: 100 });
  }

  // QR-код (300x300) под аватаркой (центрируем)
  layers.push({ input: qrBuffer, top: 160, left: Math.round((500 - 300) / 2), width: 300, height: 300 });

  // текст (SVG) снизу
  layers.push({ input: Buffer.from(svgText), top: 500, left: 0 });

  const output = await sharp({ create: { width: 500, height: 600, channels: 3, background: '#ffffff' } })
    .composite(layers)
    .png()
    .toBuffer();

  return output;
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
      // Удаляем файл из Supabase
      supabase.storage.from('overlay').remove([`tts/${filename}`]).catch(() => {});
    }, 15000);
  } catch (e) {
    console.error('❌ Ошибка генерации:', e.message);
  }
});

client.on('disconnected', (reason) => console.log('🔌', reason));
