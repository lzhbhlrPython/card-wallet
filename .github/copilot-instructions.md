# Copilot Instructions for card-wallet

Purpose: Enable AI agents to be productive in this Vue 3 + Vite front-end and Express + SQLite back-end app for managing card/FPS data with encryption and 2FA.

## Architecture (big picture)
- Front-end (Vue 3 + Pinia + Router + Vite)
  - Entry: `client/src/main.js`; routes: `client/src/router/index.js`; store: `client/src/stores/**`; pages: `client/src/pages/**`.
  - Global axios instance and auth store in `client/src/stores/auth.js` (hardcoded baseURL `http://localhost:3000`).
- Back-end (Express, single file): `server/index.js`
  - SQLite file at `server/data/database.sqlite` (created on first run). Foreign keys ON; conditional schema upgrades via `PRAGMA table_info` + `ALTER TABLE`.
  - Sensitive fields encrypted AES-256-CBC via helpers `encrypt(text)` / `decrypt(data)` (derived key from `ENCRYPTION_KEY`).
  - Static logos served at `/logos` from `assets/logos`; `helmet` configured with `crossOriginResourcePolicy: cross-origin` so Vite dev origin can load them.
- Auth: JWT (Authorization: Bearer). 2FA via TOTP (speakeasy). For sensitive endpoints send TOTP in header `x-totp` or body/query `totpCode`.

## Dev, build, deploy
- Install: `cd client && npm i && cd ../server && npm i`
- Env: `server/.env` with `PORT`, `JWT_SECRET`, `ENCRYPTION_KEY`
- Dev: `cd server && npm start` (API http://localhost:3000), `cd client && npm run dev` (UI http://localhost:5173)
- Build UI: `cd client && npm run build` -> `client/dist/`
- Deploy UI: serve `client/dist` via static hosting. If API origin/port differs, update `client/src/stores/auth.js` baseURL or place the API behind the same origin (reverse proxy). Vite runtime env must use `VITE_*` if needed in client.

## Back-end conventions (server/index.js)
- Middleware: use `authenticateToken` on protected routes; add `require2FA` on routes that return or mutate secrets (cards detail, update, delete; FPS detail/update/delete; backup; purge).
- Lists vs details: `GET /cards` returns minimal metadata only (server computes `last4`; never return full number/CVV). Full details via `GET /cards/:id` with 2FA.
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
- Reset (current state): README mentions `/2fa/reset/confirm`, server has only `/2fa/reset/init` and contains dead/inline confirm logic inside the init handler (not reachable). Implement/repair confirm flow before wiring UI that depends on it.
- Implement `/2fa/reset/confirm` (todo for agents):
  1) Add column `temp_totp_secret` to `users` if missing (follow existing conditional migration pattern).
  2) Route: `POST /2fa/reset/confirm` with body `{ code }`, guarded by `authenticateToken`.
  3) Checks: user has `twofactor_enabled=1` and `temp_totp_secret` present; verify TOTP against `temp_totp_secret`.
  4) On success: `UPDATE users SET totp_secret = temp_totp_secret, temp_totp_secret = NULL` and return success.
  5) Do not require 2FA code from the old secret here (it was already validated in `/2fa/reset/init { oldCode }`).
  6) Remove dead confirm code from `/2fa/reset/init` to avoid confusion.

## Front-end patterns
- Axios: use the exported `api` from `client/src/stores/auth.js`; it persists token to localStorage and sets default Authorization header. 401/invalid token triggers auto-logout and redirect via response interceptor.
- Router guard (`client/src/router/index.js`): all routes except `/login`, `/register` require auth; when `!twoFactorEnabled`, redirect to `/setup-2fa`.
- 2FA reset UI wiring (todo once server confirm exists): page `client/src/pages/Reset2FA.vue` should call
  - `POST /2fa/reset/init { oldCode }` -> show QR and otpauth
  - `POST /2fa/reset/confirm { code }` -> on success keep `twoFactorEnabled=true`, show success and optionally refresh QR preview/state.

## Logos rule (bank -> asset name)
- Normalize bank to UPPERCASE, replace non-alnum with `_`, try `/logos/<BANK>.svg`, fallback to `.png`, finally `fps.png`.
- Examples: `Bank of Communications` -> `bank_of_communications.svg`; `OCBC Wing Hang` -> `ocbc_wing_hang.svg`.
- Assets are in `assets/logos/*`; served by the server at `/logos/*` and consumed by the client components (e.g., `client/src/components/BankSelect.vue`, card/FPS list items).

## API usage examples
- Minimal cards: `api.get('/cards')`
- Full card details (with 2FA): `api.get('/cards/123', { headers: { 'x-totp': code } })`
- Create card (no 2FA): `api.post('/cards', { cardNumber, cvv, expiration, bank?, note? })`
- FPS banks: `api.get('/fps/banks')`; FPS detail (2FA): `api.get('/fps/1', { headers: { 'x-totp': code } })`
- Backup (2FA): `api.post('/backup', { url, username, password, subdir })`

## Testing helper
- Bulk test: `server_test.py` (export `TOKEN` then run, e.g., `python server_test.py --base-url http://localhost:3000 --only visa,mastercard`, supports `--fps`, `--fps-banks`).

## Pitfalls to respect
- Client API baseURL is hardcoded in `client/src/stores/auth.js`; update if server port/origin changes.
- Implement `/2fa/reset/confirm` before building UI flows that depend on it.
- Keep list endpoints free of full secrets; compute `last4` server-side. Ensure new sensitive endpoints always use `authenticateToken` + `require2FA`.
