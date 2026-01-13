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

// Check if running in production mode
const IS_PROD = process.argv.includes('--prod');

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

// RSA encryption helpers for documents.  Each user gets a unique
// RSA key pair (2048 bits).  The private key is encrypted with
// AES-256-CBC using the same ENCRYPTION_KEY as card data and stored
// in the database.  Document fields are encrypted with the user's
// public key and can only be decrypted with their private key.
function generateRSAKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

function encryptRSA(publicKeyPem, text) {
  const buffer = Buffer.from(text, 'utf8');
  const encrypted = crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    buffer
  );
  return encrypted.toString('base64');
}

function decryptRSA(privateKeyPem, encryptedBase64) {
  const buffer = Buffer.from(encryptedBase64, 'base64');
  const decrypted = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
    buffer
  );
  return decrypted.toString('utf8');
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
      twofactor_enabled INTEGER DEFAULT 0,
      rsa_public_key TEXT,
      encrypted_rsa_private_key TEXT
    )`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      encrypted_number TEXT NOT NULL,
      encrypted_cvv TEXT NOT NULL,
      encrypted_expiration TEXT NOT NULL,
      encrypted_cardholder TEXT,
      bank TEXT,
      card_type TEXT DEFAULT 'credit',
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
  db.run(
    `CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      document_type TEXT NOT NULL,
      encrypted_holder_name TEXT NOT NULL,
      encrypted_holder_name_latin TEXT,
      encrypted_document_number TEXT NOT NULL,
      encrypted_issue_date TEXT,
      encrypted_expiry_date TEXT,
      expiry_date_permanent INTEGER DEFAULT 0,
      encrypted_issue_place TEXT,
      expiry_date_format TEXT DEFAULT 'YMD',
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  );
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_fps_user_fpsid ON fps_accounts(user_id, fps_id)');
  db.all('PRAGMA table_info(fps_accounts)', (err, cols) => {
    if (!err && cols && !cols.some(c => c.name === 'note')) {
      db.run('ALTER TABLE fps_accounts ADD COLUMN note TEXT', () => {});
    }
  });
  // 兼容旧版本：cards 表字段补齐
  db.all('PRAGMA table_info(cards)', (err2, cols) => {
    if (err2 || !cols) return;
    if (!cols.some(c => c.name === 'note')) {
      db.run('ALTER TABLE cards ADD COLUMN note TEXT', () => {});
    }
    if (!cols.some(c => c.name === 'card_type')) {
      db.run("ALTER TABLE cards ADD COLUMN card_type TEXT DEFAULT 'credit'", () => {});
    }
    if (!cols.some(c => c.name === 'encrypted_cardholder')) {
      db.run('ALTER TABLE cards ADD COLUMN encrypted_cardholder TEXT', () => {});
    }
  });
  // 兼容旧版本：users 表添加 RSA 密钥字段
  db.all('PRAGMA table_info(users)', (err3, cols) => {
    if (err3 || !cols) return;
    if (!cols.some(c => c.name === 'rsa_public_key')) {
      db.run('ALTER TABLE users ADD COLUMN rsa_public_key TEXT', () => {});
    }
    if (!cols.some(c => c.name === 'encrypted_rsa_private_key')) {
      db.run('ALTER TABLE users ADD COLUMN encrypted_rsa_private_key TEXT', () => {});
    }
  });
  // 兼容旧版本：documents 表添加新字段
  db.all('PRAGMA table_info(documents)', (err4, cols) => {
    if (err4 || !cols) return;
    if (!cols.some(c => c.name === 'encrypted_issue_date')) {
      db.run('ALTER TABLE documents ADD COLUMN encrypted_issue_date TEXT', () => {});
    }
    if (!cols.some(c => c.name === 'expiry_date_permanent')) {
      db.run('ALTER TABLE documents ADD COLUMN expiry_date_permanent INTEGER DEFAULT 0', () => {});
    }
    
    // 修复 encrypted_expiry_date 的 NOT NULL 约束问题（支持长期证件）
    // SQLite 不支持直接修改列约束，所以我们通过重建表来实现
    const expiryDateCol = cols.find(c => c.name === 'encrypted_expiry_date');
    if (expiryDateCol && expiryDateCol.notnull === 1) {
      console.log('[Migration] Fixing encrypted_expiry_date NOT NULL constraint...');
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        // 创建临时表
        db.run(
          `CREATE TABLE documents_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            document_type TEXT NOT NULL,
            encrypted_holder_name TEXT NOT NULL,
            encrypted_holder_name_latin TEXT,
            encrypted_document_number TEXT NOT NULL,
            encrypted_issue_date TEXT,
            encrypted_expiry_date TEXT,
            expiry_date_permanent INTEGER DEFAULT 0,
            encrypted_issue_place TEXT,
            expiry_date_format TEXT DEFAULT 'YMD',
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )`,
          (err) => {
            if (err) {
              console.error('[Migration] Failed to create new table:', err);
              db.run('ROLLBACK');
              return;
            }
            // 复制数据
            db.run(
              `INSERT INTO documents_new SELECT * FROM documents`,
              (err) => {
                if (err) {
                  console.error('[Migration] Failed to copy data:', err);
                  db.run('ROLLBACK');
                  return;
                }
                // 删除旧表
                db.run('DROP TABLE documents', (err) => {
                  if (err) {
                    console.error('[Migration] Failed to drop old table:', err);
                    db.run('ROLLBACK');
                    return;
                  }
                  // 重命名新表
                  db.run('ALTER TABLE documents_new RENAME TO documents', (err) => {
                    if (err) {
                      console.error('[Migration] Failed to rename table:', err);
                      db.run('ROLLBACK');
                      return;
                    }
                    db.run('COMMIT', () => {
                      console.log('[Migration] Successfully fixed encrypted_expiry_date constraint');
                    });
                  });
                });
              }
            );
          }
        );
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
  db.get('SELECT username, twofactor_enabled, totp_secret FROM users WHERE id = ?', userId, (err, row) => {
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
    card_type: row.card_type || 'credit',
    network: row.network,
    last4,
    // 交通联合与 eCNY 列表不展示有效期
    expiration: (row.network === 'tunion' || row.network === 'ecny') ? '' : decrypt(row.encrypted_expiration),
    note: row.note || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeCardType(input) {
  if (input == null || input === '') return null;
  const v = String(input).toLowerCase();
  if (v === 'credit' || v === 'debit' || v === 'prepaid') return v;
  if (v === 'transit') return v;
  if (v === 'ecny_wallet_1' || v === 'ecny_wallet_2' || v === 'ecny_wallet_3' || v === 'ecny_wallet_4') return v;
  return null;
}

function isCardTypeValidForNetwork(network, cardType) {
  if (!cardType) return false;
  if (network === 'tunion') return cardType === 'transit';
  if (network === 'ecny') return ['ecny_wallet_1','ecny_wallet_2','ecny_wallet_3','ecny_wallet_4'].includes(cardType);
  return ['credit','debit','prepaid'].includes(cardType);
}

function deriveCardTypeForNetwork(network, inputCardType) {
  if (network === 'tunion') return { ok: true, value: 'transit' };
  const normalized = normalizeCardType(inputCardType);
  if (!normalized) return { ok: false, message: 'cardType required' };
  if (!isCardTypeValidForNetwork(network, normalized)) return { ok: false, message: 'Invalid cardType for network' };
  return { ok: true, value: normalized };
}

// Registration endpoint.  Creates a new user with a unique
// username and hashed password.  Also generates an RSA key pair
// for document encryption; the private key is encrypted with AES
// and stored alongside the public key.
// Note: Client sends MD5(password) instead of plaintext for security
// during transmission. Server stores bcrypt(MD5(password)).
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  const passwordHash = bcrypt.hashSync(password, 10);
  const { publicKey, privateKey } = generateRSAKeyPair();
  const encryptedPrivateKey = encrypt(privateKey);
  db.run(
    'INSERT INTO users (username, password_hash, rsa_public_key, encrypted_rsa_private_key) VALUES (?, ?, ?, ?)',
    [username, passwordHash, publicKey, encryptedPrivateKey],
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
// username.  If the user doesn't have RSA keys yet (legacy users),
// generate them now.
// Note: Client sends MD5(password) instead of plaintext for security
// during transmission. Server verifies bcrypt.compare(MD5, stored_hash).
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
    // 如果用户没有 RSA 密钥对（旧用户），现在生成
    if (!user.rsa_public_key || !user.encrypted_rsa_private_key) {
      const { publicKey, privateKey } = generateRSAKeyPair();
      const encryptedPrivateKey = encrypt(privateKey);
      db.run(
        'UPDATE users SET rsa_public_key = ?, encrypted_rsa_private_key = ? WHERE id = ?',
        [publicKey, encryptedPrivateKey, user.id],
        (updateErr) => {
          if (updateErr) console.error('Failed to generate RSA keys for legacy user:', updateErr);
        }
      );
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
    let cardholder = null;
    try {
      if (row.encrypted_cardholder) cardholder = decrypt(row.encrypted_cardholder);
    } catch (e) {
      cardholder = null;
    }
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
      card_type: row.card_type || 'credit',
      network: row.network,
      number: number,
      cvv: cvv,
      expiration: expiration,
      cardholder: cardholder,
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
  let { cardNumber, cvv, expiration, bank, note, cardType, card_type, cardholder } = req.body;
  if (!cardNumber || !cvv || !expiration) {
    return res.status(400).json({ message: 'cardNumber, cvv and expiration are required' });
  }
  const v = validateServerCardNumber(cardNumber);
  if (!v.ok) return res.status(400).json({ message: v.message });
  const network = v.network;
  const cardTypeResult = deriveCardTypeForNetwork(network, cardType ?? card_type);
  if (!cardTypeResult.ok) {
    // 针对 eCNY 给出更明确提示
    if (network === 'ecny') return res.status(400).json({ message: 'eCNY cardType required (ecny_wallet_1..4)' });
    if (network === 'tunion') return res.status(400).json({ message: 'Invalid cardType' });
    return res.status(400).json({ message: 'cardType required (credit/debit/prepaid)' });
  }
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
  const encCardholder = cardholder ? encrypt(String(cardholder)) : null;
  db.run(
    `INSERT INTO cards (user_id, encrypted_number, encrypted_cvv, encrypted_expiration, encrypted_cardholder, bank, card_type, network, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, encNum, encCvv, encExp, encCardholder, bank, cardTypeResult.value, network, note],
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
    if (req.body.cardholder !== undefined) {
      updates.push('encrypted_cardholder = ?');
      params.push(req.body.cardholder ? encrypt(String(req.body.cardholder)) : null);
    }
    if (req.body.note !== undefined) {
      updates.push('note = ?');
      params.push(String(req.body.note).slice(0, 1000));
    }
    // card_type 更新：需要与最终 network 一致
    const hasIncomingCardType = (req.body.cardType !== undefined || req.body.card_type !== undefined);
    const incomingNormalizedCardType = hasIncomingCardType ? normalizeCardType(req.body.cardType ?? req.body.card_type) : null;
    if (hasIncomingCardType && !incomingNormalizedCardType) {
      return res.status(400).json({ message: 'Invalid cardType' });
    }

    // 计算最终 network（若本次更新 cardNumber 会改 network）
    const pendingNetworkIndex = updates.findIndex(u => u === 'network = ?');
    const pendingNetwork = pendingNetworkIndex !== -1 ? params[pendingNetworkIndex + 1] : null;
    const effectiveNetwork = pendingNetwork || row.network;

    if (effectiveNetwork === 'tunion') {
      // 强制公交卡
      updates.push('card_type = ?');
      params.push('transit');
    } else {
      if (hasIncomingCardType) {
        if (!isCardTypeValidForNetwork(effectiveNetwork, incomingNormalizedCardType)) {
          return res.status(400).json({ message: 'Invalid cardType for network' });
        }
        updates.push('card_type = ?');
        params.push(incomingNormalizedCardType);
      } else {
        // 未提供 cardType，但如果原值与新 network 不匹配则要求显式提供
        const currentCardType = row.card_type || 'credit';
        if (!isCardTypeValidForNetwork(effectiveNetwork, currentCardType)) {
          return res.status(400).json({ message: 'cardType required for network change' });
        }
      }
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
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ message: 'Password required' });
  db.get('SELECT password_hash FROM users WHERE id = ?', [userId], (err, row) => {
    if (err || !row) return res.status(500).json({ message: 'Unable to query user' });
    const ok = bcrypt.compareSync(password, row.password_hash);
    if (!ok) return res.status(403).json({ message: 'Password incorrect' });
    // Generate and immediately bind new TOTP secret. This replaces the old
    // secret and enables 2FA for the account. The client receives the
    // otpauth URL and QR code so the user can add the new key to their
    // authenticator app.
    const secret = speakeasy.generateSecret({ length: 20, name: `CardManager (${req.user.username})` });
    db.run('UPDATE users SET totp_secret = ?, twofactor_enabled = 1 WHERE id = ?', [secret.base32, userId], (uErr) => {
      if (uErr) return res.status(500).json({ message: 'Failed to store new TOTP secret' });
      QRCode.toDataURL(secret.otpauth_url, (err3, dataURL) => {
        if (err3) return res.status(500).json({ message: 'Failed to generate QR code' });
        res.json({ otpauth_url: secret.otpauth_url, qrCode: dataURL });
      });
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
    db.serialize(() => {
      db.run('BEGIN');
      db.run('DELETE FROM cards WHERE user_id = ?', [userId], function(cardErr) {
        if (cardErr) {
          db.run('ROLLBACK');
          return res.status(500).json({ message: 'Purge cards failed' });
        }
        const cardDeleted = this.changes || 0;
        db.run('DELETE FROM fps_accounts WHERE user_id = ?', [userId], function(fpsErr) {
          if (fpsErr) {
            db.run('ROLLBACK');
            return res.status(500).json({ message: 'Purge FPS accounts failed' });
          }
          const fpsDeleted = this.changes || 0;
          db.run('COMMIT');
          res.json({ message: 'All information purged', cardsDeleted: cardDeleted, fpsDeleted });
        });
      });
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
  'HSBC', 'HANG SENG', 'STANDARD CHARTERED', 'BOC', 'ICBC', 'CCB', 'BANK OF COMMUNICATIONS', 'CITIBANK', 'DBS', 'BANK OF EAST ASIA', 'CHINA CITIC BANK', 'CHONG HING BANK', 'DAH SING BANK', 'FUBON BANK', 'PUBLIC BANK', 'OCBC WING HANG', 'SHANGHAI COMMERCIAL BANK', 'CMB WING LUNG BANK', 'NANYANG COMMERCIAL BANK', 'TAI SANG BANK'
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

// ========== Documents API ==========
// Helper to mask document number for list view
function maskDocumentNumber(number) {
  if (!number) return '********'; // 8 asterisks
  const str = String(number);
  if (str.length <= 4) {
    // For short numbers, pad to 8 characters with asterisks
    const masked = str.replace(/./g, '*');
    return masked.padEnd(8, '*');
  }
  // Show first 2 and last 2 characters, fill middle with asterisks to make total 8 chars
  return str.slice(0, 2) + '****' + str.slice(-2);
}

// Minimal document list (no 2FA required, only shows masked data)
app.get('/documents', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.all(
    'SELECT id, document_type, encrypted_holder_name, encrypted_document_number, note, created_at, updated_at FROM documents WHERE user_id = ? ORDER BY created_at DESC',
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: '获取证件列表失败' });
      db.get('SELECT rsa_public_key, encrypted_rsa_private_key FROM users WHERE id = ?', [userId], (userErr, user) => {
        if (userErr || !user || !user.encrypted_rsa_private_key) {
          return res.status(500).json({ message: '无法获取解密密钥' });
        }
        try {
          const privateKey = decrypt(user.encrypted_rsa_private_key);
          const result = rows.map(row => {
            let holderName = '****';
            let maskedNumber = '****';
            try {
              holderName = decryptRSA(privateKey, row.encrypted_holder_name);
            } catch (e) {}
            try {
              const fullNumber = decryptRSA(privateKey, row.encrypted_document_number);
              maskedNumber = maskDocumentNumber(fullNumber);
            } catch (e) {}
            return {
              id: row.id,
              document_type: row.document_type,
              holder_name: holderName,
              masked_number: maskedNumber,
              note: row.note || '',
              created_at: row.created_at,
              updated_at: row.updated_at,
            };
          });
          res.json(result);
        } catch (e) {
          return res.status(500).json({ message: '解密失败' });
        }
      });
    }
  );
});

// Get full document details (requires 2FA)
app.get('/documents/:id', authenticateToken, require2FA, (req, res) => {
  const userId = req.user.id;
  const id = req.params.id;
  db.get(
    'SELECT * FROM documents WHERE id = ? AND user_id = ?',
    [id, userId],
    (err, row) => {
      if (err || !row) return res.status(404).json({ message: '未找到该证件' });
      db.get('SELECT encrypted_rsa_private_key FROM users WHERE id = ?', [userId], (userErr, user) => {
        if (userErr || !user || !user.encrypted_rsa_private_key) {
          return res.status(500).json({ message: '无法获取解密密钥' });
        }
        try {
          const privateKey = decrypt(user.encrypted_rsa_private_key);
          const holderName = decryptRSA(privateKey, row.encrypted_holder_name);
          const holderNameLatin = row.encrypted_holder_name_latin
            ? decryptRSA(privateKey, row.encrypted_holder_name_latin)
            : '';
          const documentNumber = decryptRSA(privateKey, row.encrypted_document_number);
          const issueDate = row.encrypted_issue_date
            ? decryptRSA(privateKey, row.encrypted_issue_date)
            : '';
          const expiryDate = row.encrypted_expiry_date
            ? decryptRSA(privateKey, row.encrypted_expiry_date)
            : '';
          const issuePlace = row.encrypted_issue_place
            ? decryptRSA(privateKey, row.encrypted_issue_place)
            : '';
          res.json({
            id: row.id,
            document_type: row.document_type,
            holder_name: holderName,
            holder_name_latin: holderNameLatin,
            document_number: documentNumber,
            issue_date: issueDate,
            expiry_date: expiryDate,
            expiry_date_permanent: row.expiry_date_permanent || 0,
            expiry_date_format: row.expiry_date_format || 'YMD',
            issue_place: issuePlace,
            note: row.note || '',
            created_at: row.created_at,
            updated_at: row.updated_at,
          });
        } catch (e) {
          return res.status(500).json({ message: '解密失败' });
        }
      });
    }
  );
});

// Create new document (no 2FA required for creation)
app.post('/documents', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const {
    documentType,
    holderName,
    holderNameLatin,
    documentNumber,
    issueDate,
    expiryDate,
    expiryDatePermanent,
    expiryDateFormat,
    issuePlace,
    note,
  } = req.body;
  if (!documentType || !holderName || !documentNumber) {
    return res.status(400).json({ message: '证件类型、持有人姓名和证件号码为必填项' });
  }
  if (!expiryDatePermanent && !expiryDate) {
    return res.status(400).json({ message: '必须提供有效期或选择长期' });
  }
  const validTypes = ['passport', 'id_card', 'travel_permit', 'drivers_license'];
  if (!validTypes.includes(documentType)) {
    return res.status(400).json({ message: '无效的证件类型' });
  }
  const validFormats = ['YMD', 'MDY', 'DMY'];
  const format = expiryDateFormat || 'YMD';
  if (!validFormats.includes(format)) {
    return res.status(400).json({ message: '无效的日期格式' });
  }
  db.get('SELECT rsa_public_key FROM users WHERE id = ?', [userId], (userErr, user) => {
    if (userErr || !user || !user.rsa_public_key) {
      return res.status(500).json({ message: '无法获取加密密钥' });
    }
    try {
      const publicKey = user.rsa_public_key;
      const encryptedHolderName = encryptRSA(publicKey, String(holderName).trim());
      const encryptedHolderNameLatin = holderNameLatin
        ? encryptRSA(publicKey, String(holderNameLatin).trim())
        : null;
      const encryptedDocumentNumber = encryptRSA(publicKey, String(documentNumber).trim());
      const encryptedIssueDate = issueDate ? encryptRSA(publicKey, String(issueDate).trim()) : null;
      const encryptedExpiryDate = expiryDatePermanent ? null : (expiryDate ? encryptRSA(publicKey, String(expiryDate).trim()) : null);
      const encryptedIssuePlace = issuePlace ? encryptRSA(publicKey, String(issuePlace).trim()) : null;
      const noteValue = note ? String(note).trim().slice(0, 500) : '';
      const isPermanent = expiryDatePermanent ? 1 : 0;
      db.run(
        `INSERT INTO documents (
          user_id, document_type, encrypted_holder_name, encrypted_holder_name_latin,
          encrypted_document_number, encrypted_issue_date, encrypted_expiry_date,
          expiry_date_permanent, encrypted_issue_place, expiry_date_format, note, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          userId,
          documentType,
          encryptedHolderName,
          encryptedHolderNameLatin,
          encryptedDocumentNumber,
          encryptedIssueDate,
          encryptedExpiryDate,
          isPermanent,
          encryptedIssuePlace,
          format,
          noteValue,
        ],
        function (insertErr) {
          if (insertErr) return res.status(500).json({ message: '创建证件失败' });
          res.json({ message: '证件创建成功', id: this.lastID });
        }
      );
    } catch (e) {
      return res.status(500).json({ message: '加密失败' });
    }
  });
});

// Update document (requires 2FA)
app.put('/documents/:id', authenticateToken, require2FA, (req, res) => {
  const userId = req.user.id;
  const id = req.params.id;
  const {
    holderName,
    holderNameLatin,
    documentNumber,
    issueDate,
    expiryDate,
    expiryDatePermanent,
    expiryDateFormat,
    issuePlace,
    note,
  } = req.body;
  db.get('SELECT id FROM documents WHERE id = ? AND user_id = ?', [id, userId], (err, row) => {
    if (err || !row) return res.status(404).json({ message: '未找到该证件' });
    db.get('SELECT rsa_public_key FROM users WHERE id = ?', [userId], (userErr, user) => {
      if (userErr || !user || !user.rsa_public_key) {
        return res.status(500).json({ message: '无法获取加密密钥' });
      }
      try {
        const publicKey = user.rsa_public_key;
        const sets = [];
        const params = [];
        if (holderName) {
          sets.push('encrypted_holder_name = ?');
          params.push(encryptRSA(publicKey, String(holderName).trim()));
        }
        if (holderNameLatin !== undefined) {
          sets.push('encrypted_holder_name_latin = ?');
          params.push(holderNameLatin ? encryptRSA(publicKey, String(holderNameLatin).trim()) : null);
        }
        if (documentNumber) {
          sets.push('encrypted_document_number = ?');
          params.push(encryptRSA(publicKey, String(documentNumber).trim()));
        }
        if (issueDate !== undefined) {
          sets.push('encrypted_issue_date = ?');
          params.push(issueDate ? encryptRSA(publicKey, String(issueDate).trim()) : null);
        }
        if (expiryDate !== undefined) {
          sets.push('encrypted_expiry_date = ?');
          params.push(expiryDate ? encryptRSA(publicKey, String(expiryDate).trim()) : null);
        }
        if (expiryDatePermanent !== undefined) {
          sets.push('expiry_date_permanent = ?');
          params.push(expiryDatePermanent ? 1 : 0);
        }
        if (expiryDateFormat) {
          const validFormats = ['YMD', 'MDY', 'DMY'];
          if (!validFormats.includes(expiryDateFormat)) {
            return res.status(400).json({ message: '无效的日期格式' });
          }
          sets.push('expiry_date_format = ?');
          params.push(expiryDateFormat);
        }
        if (issuePlace !== undefined) {
          sets.push('encrypted_issue_place = ?');
          params.push(issuePlace ? encryptRSA(publicKey, String(issuePlace).trim()) : null);
        }
        if (note !== undefined) {
          sets.push('note = ?');
          params.push(note ? String(note).trim().slice(0, 500) : '');
        }
        if (sets.length === 0) {
          return res.status(400).json({ message: '无可更新字段' });
        }
        sets.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id, userId);
        db.run(
          `UPDATE documents SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
          params,
          function (updateErr) {
            if (updateErr) return res.status(500).json({ message: '更新失败' });
            res.json({ message: '更新成功' });
          }
        );
      } catch (e) {
        return res.status(500).json({ message: '加密失败' });
      }
    });
  });
});

// Delete document (requires 2FA)
app.delete('/documents/:id', authenticateToken, require2FA, (req, res) => {
  const userId = req.user.id;
  const id = req.params.id;
  db.run('DELETE FROM documents WHERE id = ? AND user_id = ?', [id, userId], function (err) {
    if (err) return res.status(500).json({ message: '删除失败' });
    if (this.changes === 0) return res.status(404).json({ message: '未找到该证件' });
    res.json({ message: '已删除' });
  });
});

// Start the server on port specified via environment or 3000.  The
// listening callback just logs the address for convenience.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Credit card manager server running on port ${PORT}`);
  console.log(`Mode: ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`);
});