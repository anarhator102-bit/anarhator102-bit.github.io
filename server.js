const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// ── MIDDLEWARE ──
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'] }));
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Serve static files (index.html)
app.use(express.static(path.join(__dirname, 'public')));

// ── DATA HELPERS ──
function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { users: {}, tracks: [], sessions: {} };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch(e) {
    return { users: {}, tracks: [], sessions: {} };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
}

function hashPassword(p) {
  return crypto.createHash('sha256').update(p + 'allowed_salt_2024').digest('hex');
}

function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  const data = readData();
  const username = data.sessions[token];
  if (!username || !data.users[username]) return res.status(401).json({ error: 'Сессия истекла' });
  req.username = username;
  req.user = data.users[username];
  next();
}

// ══════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════

// Register
app.post('/api/register', (req, res) => {
  const { username, name, password } = req.body;
  if (!username || !name || !password) return res.status(400).json({ error: 'Заполни все поля' });
  if (username.length < 3) return res.status(400).json({ error: 'Логин минимум 3 символа' });
  if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Только латиница, цифры, _' });

  const data = readData();
  if (data.users[username]) return res.status(409).json({ error: 'Логин уже занят' });

  data.users[username] = {
    username,
    name,
    password: hashPassword(password),
    joinedAt: Date.now(),
    plays: 0
  };

  const token = genToken();
  data.sessions[token] = username;
  writeData(data);

  const { password: _, ...userPublic } = data.users[username];
  res.json({ token, user: userPublic });
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Заполни все поля' });

  const data = readData();
  const user = data.users[username];
  if (!user || user.password !== hashPassword(password))
    return res.status(401).json({ error: 'Неверный логин или пароль' });

  const token = genToken();
  data.sessions[token] = username;
  writeData(data);

  const { password: _, ...userPublic } = user;
  res.json({ token, user: userPublic });
});

// Logout
app.post('/api/logout', authMiddleware, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const data = readData();
  delete data.sessions[token];
  writeData(data);
  res.json({ ok: true });
});

// Get current user
app.get('/api/me', authMiddleware, (req, res) => {
  const { password: _, ...userPublic } = req.user;
  res.json(userPublic);
});

// ══════════════════════════════════════
// TRACKS ROUTES
// ══════════════════════════════════════

// Get all tracks (without audioData for listing)
app.get('/api/tracks', (req, res) => {
  const data = readData();
  const tracks = (data.tracks || []).map(t => {
    const { audioData, ...meta } = t;
    return { ...meta, hasAudio: !!audioData };
  });
  res.json(tracks);
});

// Get single track with audio
app.get('/api/tracks/:id', (req, res) => {
  const data = readData();
  const track = (data.tracks || []).find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: 'Трек не найден' });
  res.json(track);
});

// Upload track
app.post('/api/tracks', authMiddleware, (req, res) => {
  const { title, artist, genre, desc, audioData, coverData, duration } = req.body;
  if (!title || !artist) return res.status(400).json({ error: 'Название и исполнитель обязательны' });
  if (!audioData) return res.status(400).json({ error: 'Аудиофайл обязателен' });

  // Check audio size (~50MB base64 ≈ 67MB string)
  if (audioData.length > 70 * 1024 * 1024) return res.status(413).json({ error: 'Файл слишком большой' });

  const data = readData();
  const id = 't' + Date.now() + '_' + Math.random().toString(36).slice(2,6);

  const track = {
    id, title, artist,
    genre: genre || 'other',
    desc: desc || '',
    audioData,
    coverData: coverData || null,
    coverColor: '#0a0a0a',
    duration: duration || 0,
    likes: [],
    plays: 0,
    uploadedBy: req.username,
    timestamp: Date.now()
  };

  data.tracks.push(track);
  writeData(data);

  const { audioData: _, ...trackMeta } = track;
  res.json(trackMeta);
});

// Delete track
app.delete('/api/tracks/:id', authMiddleware, (req, res) => {
  const data = readData();
  const idx = (data.tracks || []).findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Трек не найден' });
  const track = data.tracks[idx];
  if (track.uploadedBy !== req.username) return res.status(403).json({ error: 'Нет прав' });
  data.tracks.splice(idx, 1);
  writeData(data);
  res.json({ ok: true });
});

// Toggle like
app.post('/api/tracks/:id/like', authMiddleware, (req, res) => {
  const data = readData();
  const track = (data.tracks || []).find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: 'Трек не найден' });
  const idx = track.likes.indexOf(req.username);
  if (idx === -1) track.likes.push(req.username);
  else track.likes.splice(idx, 1);
  writeData(data);
  res.json({ liked: idx === -1, likesCount: track.likes.length });
});

// Increment play count
app.post('/api/tracks/:id/play', authMiddleware, (req, res) => {
  const data = readData();
  const track = (data.tracks || []).find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: 'Трек не найден' });
  track.plays = (track.plays || 0) + 1;
  if (data.users[req.username]) data.users[req.username].plays = (data.users[req.username].plays || 0) + 1;
  writeData(data);
  res.json({ plays: track.plays });
});

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.json({ ok: true, message: 'allo.wed cloud API running' });
});

app.listen(PORT, () => console.log(`allo.wed cloud running on port ${PORT}`));
