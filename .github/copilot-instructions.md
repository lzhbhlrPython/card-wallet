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
- Middleware: use `authenticateToken` on protected routes; add `require2FA` on routes that return or mutate secrets (cards detail, update, delete; FPS detail/update/delete; backup; purge).
- Lists vs details: `GET /cards` returns minimal metadata only (server computes `last4`; never return full number/CVV). Full details via `GET /cards/:id` with 2FA.
 - New sensitive field: `cards.encrypted_cardholder` (encrypted). `cardholder` is only returned by the detail endpoint (requires 2FA).
- Card type (`cards.card_type`): stores card attribute as one of `credit` | `debit` | `prepaid`.
 - Card type (`cards.card_type`): stores card attribute as English enum string.
  - DB: `cards` table has `card_type TEXT DEFAULT 'credit'` and is added via `PRAGMA table_info` + `ALTER TABLE` migration.
  - API: list/details responses include `card_type`; create/update accept either `cardType` or `card_type`.
  - Rules (server-enforced):
    - T-Union (`network='tunion'`): `card_type` is forced to `transit` (UI shows “公交卡”, input disabled)
    - eCNY (`network='ecny'`): `card_type` must be one of `ecny_wallet_1|ecny_wallet_2|ecny_wallet_3|ecny_wallet_4` (UI shows “一类/二类/三类/四类钱包”)
    - Other networks: `card_type` must be one of `credit|debit|prepaid`
- Card network rules (see `getCardNetwork`):
  - eCNY: number `^0\d{15}$` -> force `cvv=000`, `expiration=12/99`.
  - CHINA T-UNION: `^31\d{17}$` -> force `bank='CHINA T-UNION'`, `expiration=12/99`.
  - Other schemes validated by length + Luhn; unknown allows 1–80 digits.
- FPS: `GET /fps` returns rows without `note`; `GET/PUT/DELETE /fps/:id` require 2FA; banks list at `GET /fps/banks` (defined before `/:id`).
- Backup: `POST /backup` (2FA) uploads DB via WebDAV; sanitizes `subdir`; timestamped filename `cardmanager_backup_YYYYMMDD_HHmmss.sqlite`.
- Purge: `POST /cards/purge` (master password + 2FA) deletes cards and FPS accounts in a transaction; returns deleted counts.
- Misc: `app.set('etag', false)` to avoid 304 on JSON; `/logos` static path points to `assets/logos`.

## 2FA setup and reset
- Setup: `GET /2fa/setup` -> { otpauth_url, qrCode }, then `POST /2fa/verify { code }` flips `twofactor_enabled=1`.
- Reset: `POST /2fa/reset/init { password }` -> verifies account password, generates a new TOTP secret, immediately binds it to the user (sets `totp_secret` and `twofactor_enabled = 1`) and returns `{ otpauth_url, qrCode }` so the user can scan/import into an authenticator app. No old TOTP is required and no separate confirm endpoint is needed.

## Front-end patterns
- Axios: use the exported `api` from `client/src/stores/auth.js`; it persists token to localStorage and sets default Authorization header. 401/invalid token triggers auto-logout and redirect via response interceptor.
- Router guard (`client/src/router/index.js`): all routes except `/login`, `/register` require auth; when `!twoFactorEnabled`, redirect to `/setup-2fa`.
- 2FA reset UI wiring: page `client/src/pages/Reset2FA.vue` should call `POST /2fa/reset/init { password }` to generate and bind a new TOTP secret and then display the returned `otpauth_url` / `qrCode` for the user to import.
- Card type UI: stored as `card_type` from API but displayed as Chinese labels.
 - Card type UI: stored as `card_type` from API but displayed as Chinese labels.
  - Form: `client/src/pages/CardForm.vue` uses `client/src/components/BankSelect.vue` in readonly mode to prevent invalid input.
    - Normal cards: must choose “信用卡/借记卡/预付卡” -> submit `credit/debit/prepaid`
    - T-Union: auto “公交卡” -> submit `transit` (input disabled)
    - eCNY: must choose “一类/二类/三类/四类钱包” -> submit `ecny_wallet_1..4`
  - List item: `client/src/components/CardItem.vue` shows “类型 信用卡/借记卡/预付卡/公交卡/钱包等级”.
  - Details: `client/src/pages/CardDetails.vue` and the modal in `client/src/pages/CardList.vue` show “类型 …”.
  - List filtering and sorting:
    - `client/src/pages/CardList.vue` exposes a **类型** 多选筛选（展示为中文），筛选项展示顺序固定为：信用卡 / 借记卡 / 预付卡 / 公交卡 / 一类钱包 / 二类钱包 / 三类钱包 / 四类钱包。
    - `client/src/pages/CardList.vue` 支持按类型排序（`sortOption='type'`），使用上述固定顺序排序结果。

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
- Create card (no 2FA): `api.post('/cards', { cardNumber, cvv, expiration, bank?, cardType, note? })`
- Create card (no 2FA): `api.post('/cards', { cardNumber, cvv, expiration, bank?, cardType, note?, cardholder? })` — `cardholder` 为敏感字段（详情需 2FA）。
- FPS banks: `api.get('/fps/banks')`; FPS detail (2FA): `api.get('/fps/1', { headers: { 'x-totp': code } })`
- Backup (2FA): `api.post('/backup', { url, username, password, subdir })`

## Testing helper
- Bulk test: `server_test.py` (export `TOKEN` then run, e.g., `python server_test.py --base-url http://localhost:3000 --only visa,mastercard`, supports `--fps`, `--fps-banks`).

## Pitfalls to respect
- Client API baseURL is hardcoded in `client/src/stores/auth.js`; update if server port/origin changes.
 
- Keep list endpoints free of full secrets; compute `last4` server-side. Ensure new sensitive endpoints always use `authenticateToken` + `require2FA`.
