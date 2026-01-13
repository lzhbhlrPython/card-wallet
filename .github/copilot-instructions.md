# Copilot Instructions for card-wallet

Purpose: Enable AI agents to be productive in this Vue 3 + Vite front-end and Express + SQLite back-end app for managing card/FPS/document data with encryption and 2FA.

## Architecture (big picture)
- Front-end (Vue 3 + Pinia + Router + Vite)
  - Entry: `client/src/main.js`; routes: `client/src/router/index.js`; store: `client/src/stores/**`; pages: `client/src/pages/**`.
  - Global axios instance and auth store in `client/src/stores/auth.js` (hardcoded baseURL `http://localhost:3000`).
  - Reusable components: `BankSelect.vue` (dropdown with search), `Calendar.vue` (date picker), `Modal.vue` (alert/confirm), `TwoFactorPrompt.vue`.
- Back-end (Express, single file): `server/index.js`
  - SQLite file at `server/data/database.sqlite` (created on first run). Foreign keys ON; conditional schema upgrades via `PRAGMA table_info` + `ALTER TABLE`.
  - **Dual encryption system**:
    - Cards/FPS: AES-256-CBC via `encrypt(text)` / `decrypt(data)` (derived key from `ENCRYPTION_KEY`).
    - Documents: RSA-2048 per-user keypair. Public key encrypts document fields; private key (stored encrypted with AES) decrypts. Helpers: `encryptRSA()` / `decryptRSA()`.
  - Static logos served at `/logos` from `assets/logos`; `helmet` configured with `crossOriginResourcePolicy: cross-origin` so Vite dev origin can load them.
- Auth: JWT (Authorization: Bearer). 2FA via TOTP (speakeasy). For sensitive endpoints send TOTP in header `x-totp` or body/query `totpCode`.
- Password security: Client sends MD5(password); server stores bcrypt(MD5(password)). Protects against both network sniffing and DB leaks.

## Dev, build, deploy
- Install: `cd client && npm i && cd ../server && npm i`
- Env: `server/.env` with `PORT`, `JWT_SECRET`, `ENCRYPTION_KEY`
- Dev: `cd server && npm start` (API http://localhost:3000), `cd client && npm run dev` (UI http://localhost:5173)
- Build UI: `cd client && npm run build` -> `client/dist/`
- Deploy UI: serve `client/dist` via static hosting. If API origin/port differs, update `client/src/stores/auth.js` baseURL or place the API behind the same origin (reverse proxy). Vite runtime env must use `VITE_*` if needed in client.

## Back-end conventions (server/index.js)
- Middleware: use `authenticateToken` on protected routes; add `require2FA` on routes that return or mutate secrets (cards detail, update, delete; FPS detail/update/delete; documents detail/update/delete; backup; purge).
- **Three resource types** (similar patterns):
  1. **Cards** (`cards` table): List returns masked data (last4); details require 2FA; fields: `encrypted_number`, `encrypted_cvv`, `encrypted_expiration`, `encrypted_cardholder`, `card_type`, `bank`, `note`.
  2. **FPS** (`fps_accounts` table): List excludes `note`; details require 2FA; fields: `fps_id`, `recipient`, `bank`, `note`.
  3. **Documents** (`documents` table): List returns masked document_number (XX****XX, always 8 chars); details require 2FA; fields: `encrypted_holder_name`, `encrypted_holder_name_latin`, `encrypted_document_number`, `encrypted_issue_date`, `encrypted_expiry_date`, `expiry_date_permanent`, `encrypted_issue_place`, `expiry_date_format`, `document_type`, `note`. Uses RSA encryption.
- Card type (`cards.card_type`): stores card attribute as English enum string.
  - DB: `cards` table has `card_type TEXT DEFAULT 'credit'` and is added via `PRAGMA table_info` + `ALTER TABLE` migration.
  - API: list/details responses include `card_type`; create/update accept either `cardType` or `card_type`.
  - Rules (server-enforced):
    - T-Union (`network='tunion'`): `card_type` is forced to `transit` (UI shows "公交卡", input disabled)
    - eCNY (`network='ecny'`): `card_type` must be one of `ecny_wallet_1|ecny_wallet_2|ecny_wallet_3|ecny_wallet_4` (UI shows "一类/二类/三类/四类钱包")
    - Other networks: `card_type` must be one of `credit|debit|prepaid`
- Card network rules (see `getCardNetwork`):
  - eCNY: number `^0\d{15}$` -> force `cvv=000`, `expiration=12/99`.
  - CHINA T-UNION: `^31\d{17}$` -> force `bank='CHINA T-UNION'`, `expiration=12/99`.
  - Other schemes validated by length + Luhn; unknown allows 1–80 digits.
- RSA key pair lifecycle:
  - New users: keys generated on registration via `generateRSAKeyPair()`.
  - Old users: keys auto-generated on first login after upgrade (backward compatible).
  - Private key stored encrypted with same AES mechanism as card data.
- Backup: `POST /backup` (2FA) uploads DB via WebDAV; sanitizes `subdir`; timestamped filename `cardmanager_backup_YYYYMMDD_HHmmss.sqlite`.
- Purge: `POST /cards/purge` (master password + 2FA) deletes cards, FPS accounts, and documents in a transaction; returns deleted counts.
- Misc: `app.set('etag', false)` to avoid 304 on JSON; `/logos` static path points to `assets/logos`.

## 2FA setup and reset
- Setup: `GET /2fa/setup` -> { otpauth_url, qrCode }, then `POST /2fa/verify { code }` flips `twofactor_enabled=1`.
- Reset: `POST /2fa/reset/init { password }` -> verifies account password, generates a new TOTP secret, immediately binds it to the user (sets `totp_secret` and `twofactor_enabled = 1`) and returns `{ otpauth_url, qrCode }` so the user can scan/import into an authenticator app. No old TOTP is required and no separate confirm endpoint is needed.

## Front-end patterns
- Axios: use the exported `api` from `client/src/stores/auth.js`; it persists token to localStorage and sets default Authorization header. 401/invalid token triggers auto-logout and redirect via response interceptor.
- Router guard (`client/src/router/index.js`): all routes except `/login`, `/register` require auth; when `!twoFactorEnabled`, redirect to `/setup-2fa`.
- 2FA reset UI wiring: page `client/src/pages/Reset2FA.vue` should call `POST /2fa/reset/init { password }` to generate and bind a new TOTP secret and then display the returned `otpauth_url` / `qrCode` for the user to import.
- **Calendar component** (`client/src/components/Calendar.vue`): unified date picker with optional "long-term" checkbox.
  - Props: `modelValue` (date string), `permanent` (boolean), `format` (YMD/MDY/DMY), `allowPermanent`, `placeholder`.
  - Features: fast year/month dropdowns (±50 years), English month abbreviations, emits `update:modelValue` and `update:permanent`.
  - Used in: `DocumentForm.vue` for issue_date and expiry_date.
- **Modal component** (`client/src/components/Modal.vue` + `composables/useModal.js`): unified alert/confirm system.
  - Types: info/success/warning/error; methods: `alert()`, `confirm()` (returns Promise<boolean>).
  - Replaces browser alert() for consistent UX; integrated in App.vue for global access.
- Card type UI: stored as `card_type` from API but displayed as Chinese labels.
  - Form: `client/src/pages/CardForm.vue` uses `client/src/components/BankSelect.vue` in readonly mode to prevent invalid input.
    - Normal cards: must choose "信用卡/借记卡/预付卡" -> submit `credit/debit/prepaid`
    - T-Union: auto "公交卡" -> submit `transit` (input disabled)
    - eCNY: must choose "一类/二类/三类/四类钱包" -> submit `ecny_wallet_1..4`
  - List item: `client/src/components/CardItem.vue` shows "类型 信用卡/借记卡/预付卡/公交卡/钱包等级".
  - Details: `client/src/pages/CardDetails.vue` and the modal in `client/src/pages/CardList.vue` show "类型 …".
  - List filtering and sorting:
    - `client/src/pages/CardList.vue` exposes a **类型** 多选筛选（展示为中文），筛选项展示顺序固定为：信用卡 / 借记卡 / 预付卡 / 公交卡 / 一类钱包 / 二类钱包 / 三类钱包 / 四类钱包。
    - `client/src/pages/CardList.vue` 支持按类型排序（`sortOption='type'`），使用上述固定顺序排序结果。
- **Documents UI patterns**: similar to cards/FPS; list at `/documents` with type filter/sort; create/edit forms use Calendar for dates; details modal requires 2FA.
  - Document types: passport, id_card, travel_permit, drivers_license (displayed in Chinese).
  - Masked number format: always 8 chars (XX****XX) regardless of original length.
  - Date formats: YMD/MDY/DMY selectable per document; long-term option for permanent IDs.

## BankSelect readonly behavior
- `client/src/components/BankSelect.vue` 支持 props: `readonly`（只读选择）、`allowCreate`（是否允许回车创建新值）、`allowClear`（是否允许清空）。
- 当 `readonly=true` 时，组件不会基于输入进行过滤，而是展示完整选项列表，防止输入匹配导致无法切换的问题；同时可配合 `allowCreate=false` 禁止用户创建任意值。

## Logos rule (bank -> asset name)
- Normalize bank to UPPERCASE, replace non-alnum with `_`, try `/logos/<BANK>.svg`, fallback to `.png`, finally `fps.png`.
- Examples: `Bank of Communications` -> `bank_of_communications.svg`; `OCBC Wing Hang` -> `ocbc_wing_hang.svg`.
- Assets are in `assets/logos/*`; served by the server at `/logos/*` and consumed by the client components (e.g., `client/src/components/BankSelect.vue`, card/FPS list items).

## API usage examples
- Minimal cards: `api.get('/cards')`
- Full card details (with 2FA): `api.get('/cards/123', { headers: { 'x-totp': code } })`
- Create card (no 2FA): `api.post('/cards', { cardNumber, cvv, expiration, bank?, cardType, note?, cardholder? })` — `cardholder` 为敏感字段（详情需 2FA）.
- FPS banks: `api.get('/fps/banks')`; FPS detail (2FA): `api.get('/fps/1', { headers: { 'x-totp': code } })`
- Documents list: `api.get('/documents')`; details (2FA): `api.get('/documents/1', { headers: { 'x-totp': code } })`
- Create document (no 2FA): `api.post('/documents', { documentType, holderName, holderNameLatin?, documentNumber, issueDate?, expiryDate?, expiryDatePermanent?, issuePlace?, expiryDateFormat?, note? })`
- Backup (2FA): `api.post('/backup', { url, username, password, subdir })`

## Testing helper
- Bulk test: `server_test.py` (export `TOKEN` then run, e.g., `python server_test.py --base-url http://localhost:3000 --only visa,mastercard`, supports `--fps`, `--fps-banks`, `--documents`).
- Options: `--rounds N` (repeat N times), `--verbose`, `--dry-run`, `--list` (show available networks).
- Documents: 20% chance to generate long-term documents; tests all document types (passport, id_card, travel_permit, drivers_license).

## Pitfalls to respect
- Client API baseURL is hardcoded in `client/src/stores/auth.js`; update if server port/origin changes.
- Keep list endpoints free of full secrets; compute `last4` server-side. Ensure new sensitive endpoints always use `authenticateToken` + `require2FA`.
