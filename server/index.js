const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { createClient } = require('webdav');
const fs = require('fs');
const path = require('path');

// Configuration constants.  In a production environment these should come
// from environment variables rather than being hard‑coded.  They are
// collected here to make it clear which pieces of the server should be
// considered secrets.
const JWT_SECRET = process.env.JWT_SECRET || 'very_secret_jwt_key_change_me';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'very_secret_encryption_key_change_me';

// Helper functions to encrypt and decrypt sensitive card fields.  We
// derive a 32 byte AES key from the configured ENCRYPTION_KEY using
// SHA‑256.  Each encryption uses a random IV to ensure that the same
// plaintext will produce a different ciphertext when encrypted more
// than once.  The IV is prepended to the ciphertext and the two
// strings are separated by a colon.  During decryption the IV is
// parsed out of the stored value and used to initialise the cipher.
const crypto = require('crypto');
const ENCRYPTION_KEY_BYTES = crypto
  .createHash('sha256')
  .update(ENCRYPTION_KEY)
  .digest();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY_BYTES, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(data) {
  const [ivHex, encrypted] = data.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY_BYTES, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Basic card network detection.  We strip all non‑digit characters
// before matching the number against regular expressions for
// well‑known networks.  The patterns are based on public BIN ranges
// published by the payment schemes.  If no pattern matches we return
// "unknown" so the UI can display a default logo.
function getCardNetwork(number) {
  const cleaned = (number || '').replace(/\D/g, '');
  if (!cleaned) return 'unknown';

  // CHINA T-UNION: 31 + 17 digits (total 19) – must be checked before generic patterns
  if (/^31\d{17}$/.test(cleaned)) return 'tunion';
  // eCNY 数字人民币钱包: 0 开头 16 位
  if (/^0\d{15}$/.test(cleaned)) return 'ecny';
  // MIR: 2200 - 2204 (length 16)
  if (/^220[0-4]\d{12}$/.test(cleaned)) return 'mir';
  // American Express: 34 or 37 (length 15)
  if (/^3[47]\d{13}$/.test(cleaned)) return 'amex';
  // Diners Club: 300-305, 3095, 36, 38-39 (length 14)
  if (/^(?:30[0-5]\d{11}|3095\d{10}|36\d{12}|3[89]\d{12})$/.test(cleaned)) return 'diners';
  // JCB: 3528-3589 (length 16)
  if (/^(?:35(?:2[89]|[3-8]\d))\d{12}$/.test(cleaned)) return 'jcb';
  // UnionPay: 62 (length 16-19)
  if (/^62\d{14,17}$/.test(cleaned)) return 'unionpay';
  // Discover: 6011, 65, 644-649, 622126-622925 (length 16-19)
  if (/^(?:6011\d{12}|65\d{14}|64[4-9]\d{13}|622(?:12[6-9]|1[3-9]\d|[2-8]\d{2}|9(?:0\d|1\d|2[0-5]))\d{10,13})$/.test(cleaned)) return 'discover';
  // Mastercard: 51-55 或 2-series 222100–272099 （均为 16 位）
  if (cleaned.length === 16) {
    if (/^5[1-5]\d{14}$/.test(cleaned)) return 'mastercard';
    const six = Number(cleaned.slice(0,6));
    if (six >= 222100 && six <= 272099) return 'mastercard';
  }
  // Maestro: 50, 56-58, 6X (部分范围) (length 12-19). 需在 Discover/UnionPay 之后避免误判。
  if (/^(?:50\d{10,17}|5[6-9]\d{10,17}|6\d{11,18})$/.test(cleaned)) return 'maestro';
  // Visa: 13 / 16 / 19 digits starting with 4
  if (/^4\d{12}(?:\d{3}){0,2}$/.test(cleaned)) return 'visa';

  return 'unknown';
}

// Luhn 校验（服务器侧用于已知组织卡号基本校验，交通联合跳过）
function luhnValid(digits) {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

function validateServerCardNumber(raw) {
  if (!raw) return { ok: false, message: 'cardNumber required' };
  const cleaned = String(raw).replace(/\D/g, '');
  if (!/^\d+$/.test(cleaned)) return { ok: false, message: 'cardNumber must be numeric' };
  if (cleaned.length > 80) return { ok: false, message: 'cardNumber too long' };
  const network = getCardNetwork(cleaned);
  if (network === 'tunion') {
    if (!/^31\d{17}$/.test(cleaned)) return { ok: false, message: 'Invalid T-Union number' };
    return { ok: true, network, cleaned };
  }
  if (network === 'ecny') {
    if (!/^0\d{15}$/.test(cleaned)) return { ok: false, message: 'Invalid eCNY number' };
    return { ok: true, network, cleaned };
  }
  if (network === 'unknown') {
    // 允许任意 1-80 位纯数字
    if (cleaned.length < 1) return { ok: false, message: 'cardNumber too short' };
    return { ok: true, network, cleaned };
  }
  // 已知其它组织：12-19 位 + Luhn
  if (cleaned.length < 12 || cleaned.length > 19) return { ok: false, message: 'cardNumber length invalid' };
  if (!luhnValid(cleaned)) return { ok: false, message: 'cardNumber failed checksum' };
  return { ok: true, network, cleaned };
}

// Initialise SQLite database.  We use a file stored in the local
// `data` directory.  When run for the first time the tables are
// created.  The `cards` table stores encrypted card details and
// ancillary metadata.  The `users` table stores login credentials
// along with two‑factor secrets.  Using `INTEGER PRIMARY KEY` causes
// SQLite to autoincrement the id.  Foreign key support must be
// enabled explicitly.
const dbFile = path.join(__dirname, 'data', 'database.sqlite');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new sqlite3.Database(dbFile);
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      totp_secret TEXT,
      twofactor_enabled INTEGER DEFAULT 0
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      encrypted_number TEXT NOT NULL,
      encrypted_cvv TEXT NOT NULL,
      encrypted_expiration TEXT NOT NULL,
      bank TEXT,
      network TEXT,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS fps_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      fps_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      bank TEXT NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_fps_user_fpsid ON fps_accounts(user_id, fps_id)');
  db.all('PRAGMA table_info(fps_accounts)', (err, cols) => {
    if (!err && cols && !cols.some(c => c.name === 'note')) {
      db.run('ALTER TABLE fps_accounts ADD COLUMN note TEXT', () => {});
    }
  });
  // 兼容旧版本：若无 note 字段则补充
  db.get("PRAGMA table_info(cards)", (e) => {
    if (!e) {
      db.all('PRAGMA table_info(cards)', (err2, cols) => {
        if (!err2 && cols && !cols.some(c => c.name === 'note')) {
          db.run('ALTER TABLE cards ADD COLUMN note TEXT', ()=>{});
        }
      });
    }
  });
});

const app = express();
// 禁用 ETag，避免条件请求返回 304 使前端拿不到实体数据
app.set('etag', false);
// 解决浏览器在不同端口 (如 Vite:5173 -> API:3000) 加载 /logos/*.svg 时出现
// ERR_BLOCKED_BY_RESPONSE.NotSameOrigin 的问题：helmet 默认设置
// Cross-Origin-Resource-Policy: same-origin，会阻止其他源引用静态资源。
// 将其放宽为 cross-origin（或直接禁用）即可。
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors());
app.use(express.json());
app.use('/logos', express.static(path.join(__dirname, '../assets/logos')));

// Authentication middleware.  If a bearer token is present and
// valid we attach the user id and username to `req.user`.  If no
// token is present we return 401 to force the client to log in.
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Middleware to enforce 2FA verification on endpoints that expose
// sensitive data.  Clients must supply a valid TOTP code either
// through a header called `x-totp` or a JSON body property called
// `totpCode`.  If the user does not have 2FA enabled this
// middleware always calls `next()`.
function require2FA(req, res, next) {
  const userId = req.user.id;
  db.get('SELECT twofactor_enabled, totp_secret FROM users WHERE id = ?', userId, (err, row) => {
    if (err || !row) return res.status(500).json({ message: 'Failed to verify 2FA status' });
    if (!row.twofactor_enabled) return next();
    const token =
      req.headers['x-totp'] ||
      (req.body && req.body.totpCode) ||
      (req.query && req.query.totpCode);
    if (!token) return res.status(400).json({ message: 'TOTP code required' });
    const verified = speakeasy.totp.verify({ secret: row.totp_secret, encoding: 'base32', token });
    if (!verified) return res.status(400).json({ message: 'Invalid TOTP code' });
    return next();
  });
}

// Utility to retrieve minimal card info.  We decrypt the card number to
// compute the last four digits but never return the full number to
// this endpoint.  Doing this at the server avoids transferring more
// sensitive data to the client than necessary.  The card holder can
// view full details by calling GET /cards/:id with a valid TOTP code.
function mapCardRow(row) {
  let last4 = '';
  try {
    const numberRaw = decrypt(row.encrypted_number);
    const cleaned = numberRaw.replace(/\D/g, '');
    last4 = cleaned.slice(-4);
  } catch (e) {
    last4 = '****';
  }
  return {
    id: row.id,
    bank: row.bank,
    network: row.network,
    last4,
    // 交通联合与 eCNY 列表不展示有效期
    expiration: (row.network === 'tunion' || row.network === 'ecny') ? '' : decrypt(row.encrypted_expiration),
    note: row.note || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Registration endpoint.  Creates a new user with a unique
// username and hashed password.  Responds with a success message
// when the user is created.  Does not automatically log the user in.
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  const passwordHash = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    [username, passwordHash],
    function (err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(409).json({ message: 'Username already exists' });
        }
        return res.status(500).json({ message: 'Registration failed' });
      }
      res.json({ message: 'Registration successful' });
    }
  );
});

// Login endpoint.  Verifies the username and password.  If 2FA is
// enabled the client must supply a valid TOTP code in the request
// body.  On success returns a JWT token containing the user id and
// username.  The client should store this token and send it in the
// Authorization header for subsequent requests.
app.post('/login', (req, res) => {
  const { username, password, totpCode } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ message: 'Login failed' });
    if (!user) return res.status(401).json({ message: 'Invalid username or password' });
    const validPwd = bcrypt.compareSync(password, user.password_hash);
    if (!validPwd) return res.status(401).json({ message: 'Invalid username or password' });
    if (user.twofactor_enabled) {
      if (!totpCode) return res.status(403).json({ twoFactorRequired: true, message: 'TOTP code required' });
      const verified = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: totpCode });
      if (!verified) return res.status(401).json({ message: 'Invalid TOTP code' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, twoFactorEnabled: !!user.twofactor_enabled });
  });
});

// Route to initiate TOTP setup.  Returns a QR code and otpauth URL
// that can be scanned/imported into authenticator apps like Microsoft
// Authenticator or Google Authenticator.  This route is only
// accessible when logged in and 2FA is not already enabled.  The
// secret is stored in the database but the `twofactor_enabled` flag
// remains off until the verification endpoint confirms the code.
app.get('/2fa/setup', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.get('SELECT twofactor_enabled FROM users WHERE id = ?', [userId], (err, row) => {
    if (err || !row) return res.status(500).json({ message: 'Failed to initiate 2FA setup' });
    if (row.twofactor_enabled) return res.status(400).json({ message: '2FA already enabled' });
    const secret = speakeasy.generateSecret({ length: 20, name: `CardManager (${req.user.username})` });
    // Save the secret temporarily.  It will be finalised once the user
    // verifies it via the /2fa/verify endpoint.  Upsert pattern used
    // here ensures that the secret is stored even if the user has
    // requested setup previously.  Note: we do not flip the
    // twofactor_enabled flag yet.
    db.run('UPDATE users SET totp_secret = ? WHERE id = ?', [secret.base32, userId], err2 => {
      if (err2) return res.status(500).json({ message: 'Failed to store 2FA secret' });
      QRCode.toDataURL(secret.otpauth_url, (err3, dataURL) => {
        if (err3) return res.status(500).json({ message: 'Failed to generate QR code' });
        res.json({ otpauth_url: secret.otpauth_url, qrCode: dataURL });
      });
    });
  });
});

// Endpoint to verify the provided TOTP and enable two‑factor
// authentication.  If the code is valid we flip the
// twofactor_enabled flag so future logins will require a TOTP code.
app.post('/2fa/verify', authenticateToken, (req, res) => {
  const { code } = req.body;
  const userId = req.user.id;
  if (!code) return res.status(400).json({ message: 'TOTP code required' });
  db.get('SELECT totp_secret, twofactor_enabled FROM users WHERE id = ?', [userId], (err, row) => {
    if (err || !row) return res.status(500).json({ message: 'Unable to verify TOTP' });
    if (row.twofactor_enabled) return res.status(400).json({ message: '2FA already enabled' });
    const verified = speakeasy.totp.verify({ secret: row.totp_secret, encoding: 'base32', token: code });
    if (!verified) return res.status(400).json({ message: 'Invalid TOTP code' });
    db.run('UPDATE users SET twofactor_enabled = 1 WHERE id = ?', [userId], err2 => {
      if (err2) return res.status(500).json({ message: 'Failed to enable 2FA' });
      res.json({ message: 'Two-factor authentication enabled' });
    });
  });
});

// Route to list all cards for the authenticated user.  Returns an
// array of objects containing the id, bank, network, last4 digits
// and expiration date.  This endpoint does not require a TOTP code
// because it never exposes the full card number or CVV.
app.get('/cards', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.all('SELECT * FROM cards WHERE user_id = ?', [userId], (err, rows) => {
    if (err) return res.status(500).json({ message: 'Failed to load cards' });
    const result = rows.map(mapCardRow);
    res.json(result);
  });
});

// Route to get full card details.  Requires 2FA verification as it
// returns sensitive information (number, CVV).  The caller must
// supply a valid TOTP code via header, body or query string.
app.get('/cards/:id', authenticateToken, require2FA, (req, res) => {
  const userId = req.user.id;
  const cardId = req.params.id;
  db.get('SELECT * FROM cards WHERE id = ? AND user_id = ?', [cardId, userId], (err, row) => {
    if (err || !row) return res.status(404).json({ message: 'Card not found' });
    let number = decrypt(row.encrypted_number);
    let cvv = decrypt(row.encrypted_cvv);
    let expiration = decrypt(row.encrypted_expiration);
    // 强制 eCNY 规则（防止旧数据未被覆盖）
    if (row.network === 'ecny') {
      cvv = '000';
      expiration = '12/99';
    } else if (row.network === 'tunion') {
      expiration = '12/99';
    }
    const card = {
      id: row.id,
      bank: row.bank,
      network: row.network,
      number: number,
      cvv: cvv,
      expiration: expiration,
      note: row.note || '',
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    res.json(card);
  });
});

// Route to create a new card.  Accepts cardNumber, cvv, expiration
// and bank.  Detects the network automatically and stores an
// encrypted version of all sensitive fields.  Returns the id of the
// new card.  We do not require 2FA for card creation to make
// onboarding easier but this can be adjusted.
app.post('/cards', authenticateToken, (req, res) => {
  const userId = req.user.id;
  let { cardNumber, cvv, expiration, bank, note } = req.body;
  if (!cardNumber || !cvv || !expiration) {
    return res.status(400).json({ message: 'cardNumber, cvv and expiration are required' });
  }
  const v = validateServerCardNumber(cardNumber);
  if (!v.ok) return res.status(400).json({ message: v.message });
  const network = v.network;
  bank = bank || '';
  note = (note || '').slice(0, 1000);
  if (network === 'tunion') {
    bank = 'CHINA T-UNION';
    expiration = '12/99';
  } else if (network === 'ecny') {
    expiration = '12/99';
    cvv = '000'; // eCNY 强制 000
  }
  const encNum = encrypt(cardNumber);
  const encCvv = encrypt(cvv);
  const encExp = encrypt(expiration);
  db.run(
    `INSERT INTO cards (user_id, encrypted_number, encrypted_cvv, encrypted_expiration, bank, network, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, encNum, encCvv, encExp, bank, network, note],
    function (err) {
      if (err) return res.status(500).json({ message: 'Failed to create card' });
      res.json({ id: this.lastID, network });
    }
  );
});

// Route to update an existing card.  Requires 2FA as full
// information can be modified.  Accepts partial updates but will
// ignore unknown fields.  Automatically updates the network when
// card number changes.
app.put('/cards/:id', authenticateToken, require2FA, (req, res) => {
  const userId = req.user.id;
  const cardId = req.params.id;
  db.get('SELECT * FROM cards WHERE id = ? AND user_id = ?', [cardId, userId], (err, row) => {
    if (err || !row) return res.status(404).json({ message: 'Card not found' });
    const updates = [];
    const params = [];
    if (req.body.cardNumber) {
      const v = validateServerCardNumber(req.body.cardNumber);
      if (!v.ok) return res.status(400).json({ message: v.message });
      updates.push('encrypted_number = ?');
      params.push(encrypt(req.body.cardNumber));
      const newNetwork = v.network;
      updates.push('network = ?');
      params.push(newNetwork);
      if (newNetwork === 'tunion') {
        updates.push('bank = ?'); params.push('CHINA T-UNION');
        updates.push('encrypted_expiration = ?'); params.push(encrypt('12/99'));
      } else if (newNetwork === 'ecny') {
        updates.push('encrypted_expiration = ?'); params.push(encrypt('12/99'));
        updates.push('encrypted_cvv = ?'); params.push(encrypt('000')); // eCNY 强制 000
      }
    }
    if (req.body.cvv) { 
      // 仅当不是 eCNY 且不是 T-Union 时允许更新（eCNY 固定 000）
      const pendingNetworkIndex = updates.findIndex(u => u === 'network = ?');
      const pendingNetwork = pendingNetworkIndex !== -1 ? params[pendingNetworkIndex + 1] : null;
      const effectiveNetwork = pendingNetwork || row.network;
      if (effectiveNetwork !== 'ecny' && effectiveNetwork !== 'tunion') {
        updates.push('encrypted_cvv = ?'); params.push(encrypt(req.body.cvv)); 
      }
    }
    if (req.body.expiration) {
      const pendingNetworkIndex = updates.findIndex(u => u === 'network = ?');
      const pendingNetwork = pendingNetworkIndex !== -1 ? params[pendingNetworkIndex + 1] : null;
      if (row.network !== 'tunion' && row.network !== 'ecny' && pendingNetwork !== 'tunion' && pendingNetwork !== 'ecny') {
        updates.push('encrypted_expiration = ?');
        params.push(encrypt(req.body.expiration));
      }
    }
    if (row.network === 'tunion' && !req.body.cardNumber) {
      updates.push('encrypted_expiration = ?');
      params.push(encrypt('12/99'));
    } else if (row.network === 'ecny' && !req.body.cardNumber) {
      updates.push('encrypted_expiration = ?');
      params.push(encrypt('12/99'));
      updates.push('encrypted_cvv = ?');
      params.push(encrypt('000')); // 确保保持 000
    }
    if (req.body.bank !== undefined) {
      const newDigits = (req.body.cardNumber||'').replace(/\D/g,'');
      if (row.network === 'tunion' || /^31\d{17}$/.test(newDigits)) {
        // ignore bank change for tunion
      } else {
        updates.push('bank = ?'); params.push(req.body.bank);
      }
    }
    if (req.body.note !== undefined) {
      updates.push('note = ?');
      params.push(String(req.body.note).slice(0, 1000));
    }
    if (updates.length === 0) return res.status(400).json({ message: 'No valid fields to update' });
    params.push(cardId, userId);
    const sql = `UPDATE cards SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`;
    db.run(sql, params, function (updateErr) {
      if (updateErr) return res.status(500).json({ message: 'Failed to update card' });
      res.json({ message: 'Card updated' });
    });
  });
});

// Route to delete a card.  Requires 2FA.  Deletes the record from
// the database.  Foreign key cascade ensures only this user's card
// disappears.  Returns a success message regardless of whether
// anything was deleted to avoid leaking existence information.
app.delete('/cards/:id', authenticateToken, require2FA, (req, res) => {
  const userId = req.user.id;
  const cardId = req.params.id;
  db.run('DELETE FROM cards WHERE id = ? AND user_id = ?', [cardId, userId], function (err) {
    if (err) return res.status(500).json({ message: 'Failed to delete card' });
    res.json({ message: 'Card deleted' });
  });
});

// Route to perform an optional WebDAV backup.  Requires 2FA.  The
// client must supply the remote WebDAV endpoint and authentication
// credentials.  The server uploads a copy of the SQLite database
// using the webdav npm package.  In a production environment you
// would want to restrict the host and possibly require an
// encryption key for the backup.  For demonstration purposes we
// simply upload the database file directly.  The endpoint is
// idempotent – performing multiple backups will overwrite the
// remote file.
app.post('/backup', authenticateToken, require2FA, async (req, res) => {
  const { url, username, password, subdir } = req.body;
  if (!url || !username || !password) {
    return res.status(400).json({ message: 'WebDAV url, username and password required' });
  }
  try {
    const client = createClient(url, { username, password });
    // 生成时间戳文件名：YYYYMMDD_HHmmss
    const ts = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timestamp = `${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    const filename = `cardmanager_backup_${timestamp}.sqlite`;

    // 清理子目录，防止注入 .. 与前后斜杠
    let remotePath = filename;
    if (subdir) {
      const clean = String(subdir)
        .replace(/\\/g, '/')
        .replace(/\.\.+/g, '')
        .replace(/^\/+|\/+$/g, '')
        .trim();
      if (clean) {
        try { await client.createDirectory(clean, { recursive: true }); } catch (e) { /* 忽略目录已存在错误 */ }
        remotePath = `${clean}/${filename}`;
      }
    }

    const data = fs.readFileSync(dbFile);
    await client.putFileContents(remotePath, data, { overwrite: true });
    res.json({ message: 'Backup completed successfully', path: remotePath });
  } catch (e) {
    console.error('WebDAV backup failed', e);
    res.status(500).json({ message: 'Backup failed', error: e.message });
  }
});

// 重新生成一个新的 TOTP 秘钥（需要已登录并已启用 2FA，防止绕过）。返回新的 otpauth URL 与临时二维码，但不立即生效，直到用户验证。
app.post('/2fa/reset/init', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { oldCode } = req.body || {};
  db.get('SELECT twofactor_enabled, totp_secret FROM users WHERE id = ?', [userId], (err, row) => {
    if (err || !row) return res.status(500).json({ message: '无法查询用户状态' });
    if (!row.twofactor_enabled) return res.status(400).json({ message: '尚未启用 2FA 无需重置' });
    if (!oldCode) return res.status(400).json({ message: '旧验证码必填' });
    const verifiedOld = speakeasy.totp.verify({ secret: row.totp_secret, encoding: 'base32', token: oldCode });
    if (!verifiedOld) return res.status(400).json({ message: '旧验证码不正确' });
    const secret = speakeasy.generateSecret({ length: 20, name: `CardManager (${req.user.username})` });
    db.run('ALTER TABLE users ADD COLUMN temp_totp_secret TEXT', () => {
      db.run('UPDATE users SET temp_totp_secret = ? WHERE id = ?', [secret.base32, userId], err2 => {
        if (err2) return res.status(500).json({ message: '存储新密钥失败' });
        QRCode.toDataURL(secret.otpauth_url, (err3, dataURL) => {
          if (err3) return res.status(500).json({ message: '生成二维码失败' });
          res.json({ otpauth_url: secret.otpauth_url, qrCode: dataURL });
        });
      });
    });
    if (!row.twofactor_enabled) return res.status(400).json({ message: '尚未启用 2FA 无需重置' });
    if (!row.temp_totp_secret) return res.status(400).json({ message: '未发起重置或已完成' });
    const verified = speakeasy.totp.verify({ secret: row.temp_totp_secret, encoding: 'base32', token: code });
    if (!verified) return res.status(400).json({ message: 'Invalid TOTP code' });
    db.run('UPDATE users SET totp_secret = temp_totp_secret, temp_totp_secret = NULL WHERE id = ?', [userId], err2 => {
      if (err2) return res.status(500).json({ message: '更新密钥失败' });
      res.json({ message: 'TOTP 重置成功' });
    });
  });
});

// Route to purge all cards for the authenticated user. Requires the master password and 2FA verification.
// This is a destructive action that removes all card records for the user.
app.post('/cards/purge', authenticateToken, require2FA, (req, res) => {
  const { masterPassword } = req.body || {};
  if (!masterPassword) return res.status(400).json({ message: 'masterPassword required' });
  const userId = req.user.id;
  db.get('SELECT password_hash FROM users WHERE id = ?', [userId], (err, row) => {
    if (err || !row) return res.status(500).json({ message: 'Verification failed' });
    const ok = bcrypt.compareSync(masterPassword, row.password_hash);
    if (!ok) return res.status(403).json({ message: 'Master password incorrect' });
    db.run('DELETE FROM cards WHERE user_id = ?', [userId], function (delErr) {
      if (delErr) return res.status(500).json({ message: 'Purge failed' });
      res.json({ message: 'All cards purged', deleted: this.changes });
    });
  });
});

// 列出当前用户全部 FPS 账户（不含敏感备注 note）
app.get('/fps', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.all('SELECT id, fps_id, recipient, bank, created_at FROM fps_accounts WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
    if (err) return res.status(500).json({ message: '加载 FPS 账户失败' });
    res.json(rows);
  });
});

// 创建 FPS 账户（不含 note 展示，创建不强制 2FA，与卡片创建策略一致）
app.post('/fps', authenticateToken, (req, res) => {
  const userId = req.user.id;
  let { fpsId, recipient, bank, note } = req.body || {};
  fpsId = String(fpsId || '').trim();
  recipient = String(recipient || '').trim();
  bank = String(bank || '').trim().toUpperCase();
  note = (note ? String(note) : '').trim().slice(0, 500);
  if (!/^\d{8,12}$/.test(fpsId)) return res.status(400).json({ message: 'FPS ID 必须为 8-12 位数字' });
  if (!recipient) return res.status(400).json({ message: '收款人必填' });
  if (!bank) return res.status(400).json({ message: '银行必填' });
  db.run('INSERT INTO fps_accounts (user_id, fps_id, recipient, bank, note) VALUES (?,?,?,?,?)', [userId, fpsId, recipient, bank, note], function(err){
    if (err) {
      if (err.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ message: '该 FPS ID 已存在' });
      return res.status(500).json({ message: '创建失败' });
    }
    res.json({ id: this.lastID });
  });
});

// 先定义银行列表路由，避免被 /fps/:id 捕获 (banks 会被视为 id 导致 404)
const FPS_BANKS = [
  'HSBC', 'HANG SENG', 'STANDARD CHARTERED', 'BOC', 'ICBC', 'CCB', 'BANK OF COMMUNICATIONS', 'CITIBANK', 'DBS', 'BANK OF EAST ASIA', 'CHINA CITIC BANK', 'CHONG HING BANK', 'DAH SING BANK', 'FUBON BANK', 'PUBLIC BANK', 'OCBC WING HANG', 'SHANGHAI COMMERCIAL BANK', 'CMB WING LUNG BANK', 'TAI SANG BANK'
];
app.get('/fps/banks', authenticateToken, (req, res) => {
  res.json(FPS_BANKS);
});

// 获取单个 FPS 账户详情（含 note）需要 2FA
app.get('/fps/:id', authenticateToken, require2FA, (req, res) => {
  const userId = req.user.id;
  const id = req.params.id;
  db.get('SELECT id, fps_id, recipient, bank, note, created_at FROM fps_accounts WHERE id = ? AND user_id = ?', [id, userId], (err, row) => {
    if (err || !row) return res.status(404).json({ message: '未找到该账户' });
    res.json(row);
  });
});
// 更新 FPS 账户（recipient / bank / note，可选）需要 2FA；fps_id 不允许修改
app.put('/fps/:id', authenticateToken, require2FA, (req, res) => {
  const userId = req.user.id;
  const id = req.params.id;
  const { recipient, bank, note } = req.body || {};
  if (!recipient && !bank && note === undefined) return res.status(400).json({ message: '无可更新字段' });
  db.get('SELECT id FROM fps_accounts WHERE id = ? AND user_id = ?', [id, userId], (err, row) => {
    if (err || !row) return res.status(404).json({ message: '未找到该账户' });
    const sets = [];
    const params = [];
    if (recipient) { sets.push('recipient = ?'); params.push(String(recipient).trim().slice(0, 100)); }
    if (bank) { sets.push('bank = ?'); params.push(String(bank).trim().slice(0, 100)); }
    if (note !== undefined) { sets.push('note = ?'); params.push(note ? String(note).trim().slice(0, 500) : ''); }
    if (!sets.length) return res.status(400).json({ message: '无效字段' });
    params.push(id, userId);
    db.run(`UPDATE fps_accounts SET ${sets.join(', ')}, created_at = created_at WHERE id = ? AND user_id = ?`, params, function (uErr) {
      if (uErr) return res.status(500).json({ message: '更新失败' });
      res.json({ message: '更新成功' });
    });
  });
});
// 删除 FPS 账户（需要 2FA）
app.delete('/fps/:id', authenticateToken, require2FA, (req, res) => {
  const userId = req.user.id;
  const id = req.params.id;
  db.run('DELETE FROM fps_accounts WHERE id = ? AND user_id = ?', [id, userId], function (err) {
    if (err) return res.status(500).json({ message: '删除失败' });
    res.json({ message: '已删除' });
  });
});

// Start the server on port specified via environment or 3000.  The
// listening callback just logs the address for convenience.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Credit card manager server running on port ${PORT}`);
});