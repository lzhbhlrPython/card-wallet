# Card Wallet (Vue + Express + Encrypted SQLite)

一个带本地加密、用户认证与双因素认证 (TOTP) 的信用卡/卡片信息管理示例应用。前端使用 Vue 3 + Vite + Pinia，后端使用 Express + SQLite，并提供基于 WebDAV 的手动远程备份能力。

> 当前版本：1.3.1

## 功能特性
- 用户注册 / 登录（JWT 会话）
- 可选 TOTP 双因素认证（Speakeasy + 二维码）
- 卡号 / CVV / 有效期基于 AES-256-CBC 加密后存入 SQLite
- 自动识别多种卡组织 (Visa / Mastercard / Amex / UnionPay / Discover / JCB / Diners / Maestro / MIR / CHINA T-UNION / eCNY / 其它)
- 服务端校验卡号（含 Luhn 校验，特例：T-Union / eCNY）
- 列表仅展示末四位与必要元数据，详情接口需二次 2FA 验证
- 支持备注 note 字段
- WebDAV 手动备份数据库（时间戳命名）
- FPS 账户管理：列表、详情 (2FA)、创建、编辑、删除、备注隐私保护
- 清空信息（Purge）：主密码 + 2FA（如启用）一次性删除卡片与 FPS 账户
- 银行 Logo 多级回退：优先加载 svg，失败尝试同名 png，再回退 fps.png

## 最近更新（已发布 v1.3.0）

以下为 v1.3.0 中实现的重要变更，包含数据库迁移、后端验证与前端 UX 改进：

- 后端：新增 `cards.card_type` 字段（English enum），可能值：`credit | debit | prepaid | transit | ecny_wallet_1..4`。
  - 通过数据库迁移（PRAGMA table_info -> ALTER TABLE）自动添加列以兼容旧数据库。
  - API 在创建/更新时校验并强制网络特殊规则：
    - `tunion` (CHINA T-UNION) 强制 `card_type='transit'`，并对有效期/显示做特殊处理。
    - `ecny` (eCNY) 必须使用 `ecny_wallet_1..4` 之一；服务端会把 CVV/有效期调整为 000 / 12/99（按规则展示）。
  - 列表接口 `/cards` 仍然只返回非敏感元数据（服务器计算 `last4`）；卡片详情现在通过列表内弹窗查看（需 2FA），不再提供独立的 `/cards/:id` 路由。

- 前端：显示与交互改进
  - 在卡片创建/编辑表单增加“类型”字段（使用统一 `BankSelect` 风格控件），UI 展示为中文标签（信用卡/借记卡/预付卡/公交卡/一类..四类钱包），但提交给服务端为 English enum（`cardType` 字段）。
  - `BankSelect` 增加 `readonly` / `allowCreate` / `allowClear` 属性：当 `readonly` 为真时，组件不会基于输入进行过滤，且可通过 `allowCreate=false` 禁止用户创建任意值（用于卡类型选择以避免非法输入）。
  - 卡片列表增加“类型”筛选与“按类型”排序，排序使用固定顺序：信用卡 / 借记卡 / 预付卡 / 公交卡 / 一类钱包 / 二类钱包 / 三类钱包 / 四类钱包。
  - 卡片项(`CardItem`)将 `类型` 放在左侧，`有效期` 放在右侧并列展示，字体权重与颜色统一以便快速识别。
  - 卡片详情通过列表内弹窗查看（需 2FA）；独立路由 `/cards/:id` 已移除以避免重复入口点。列表中的“详情”按钮会打开弹窗；删除操作仍使用 2FA 弹窗确认。

- 测试与文档
  - `server_test.py` 已更新以在创建测试卡时包含 `cardType` 字段并覆盖特殊网络规则。
  - `.github/copilot-instructions.md` 已同步更新，包含后端约束与前端表单/显示规则说明。

 数据库兼容性注意：
 - 本次发布新增 `cards.card_type` 字段（枚举），服务端在启动时会尝试通过迁移（`PRAGMA table_info` + `ALTER TABLE`）自动添加该列，但建议在升级前先备份 `server/data/database.sqlite` 以防万一。
 - 如果你使用旧版本客户端（< v1.3.0），可能无法正确显示或提交 `cardType` 字段；请同时更新前端到 v1.3.0 以确保兼容性。
 - 若需回退或审计迁移，请先备份数据库，再参阅 `server/index.js` 中的迁移逻辑与变更记录。

## 目录结构
```
assets/            # 通用静态资源（卡组织 svg 等）
client/            # 前端 (Vue 3 + Vite)
  src/
  index.html
server/            # 后端 (Express)
  index.js
  data/            # 运行期生成的 SQLite 数据库 (被 .gitignore 忽略)
```

## 功能概览
- FPS 账户：后端 `fps_accounts` 表与 `/fps` 相关 REST 接口（列表不含 note，详情/修改/删除需 2FA）。
- 前端页面：`/fps` 列表、`/fps/new` 创建、`/fps/:id` 详情、`/fps/:id/edit` 编辑。
- 备注 (note) 仅在 2FA 验证后可见；列表不展示以降低敏感泄漏面。
- 银行 Logo 规则：银行字符串转大写，非字母数字替换为下划线，尝试加载对应 svg；缺失时使用 `fps.png` 兜底。

## 快速开始
### 1. 克隆与安装依赖
```bash
git clone git@github.com:lzhbhlrPython/card-wallet.git card_wallet
cd card_wallet
# 安装前端
cd client && npm install && cd ..
# 安装后端
cd server && npm install && cd ..
```

### 2. 配置环境变量
在根目录或 `server/` 下创建 `.env`（不会提交，已在 .gitignore 中），并提供安全随机值。

可用示例（请勿在生产使用示例值）：
```
# server/.env
PORT=3000
JWT_SECRET=change_this_to_long_random_string
ENCRYPTION_KEY=another_long_random_string_for_aes
```
如果你希望前端在构建中访问变量，可使用 Vite 约定：`client/.env` 中以 `VITE_` 前缀命名。

### 3. 启动开发环境
在两个终端分别：
```bash
# 后端
cd server
npm start

# 前端
cd client
npm run dev
```
前端默认在 http://localhost:5173 ，后端在 http://localhost:3000

## 运行流程概览
1. 注册用户：POST /register
2. 登录：POST /login -> 得到 JWT
3. （可选）启用 2FA：
   - GET /2fa/setup -> 返回 otpauth_url + QR 二维码 DataURL
   - POST /2fa/verify 发送首次验证码确认
4. 管理卡片：
   - 列表：GET /cards (无需 2FA)
   - 查看详情：GET /cards/:id (需 2FA)
   - 新增：POST /cards (无需 2FA)
   - 修改：PUT /cards/:id (需 2FA)
   - 删除：DELETE /cards/:id (需 2FA)
5. 备份：POST /backup (需 2FA)

所有受保护接口需在 Header 加 `Authorization: Bearer <token>`。
需要 2FA 的接口再提供：
- `x-totp: <6位码>` 或在 JSON body / query 中 `totpCode`。

## 安全注意事项
- 不要把生产数据库 (`server/data/database.sqlite`) 或备份文件提交到仓库，已经通过 `.gitignore` 屏蔽。
- 一定使用强随机的 `JWT_SECRET` 与 `ENCRYPTION_KEY`，并存放在环境变量或秘密管理服务中。
- 当前代码用于示例，未实现：密码复杂度策略、速率限制、账户锁定、审计日志、多租户隔离、密钥轮换等。生产需补充。
- WebDAV 备份为明文 SQLite；如需更强安全性，可：
  1. 再次对整个文件进行对称加密后上传
  2. 或仅导出加密后的数据片段
- 浏览器端切勿缓存完整卡号；此示例中只有在详情查看时返回完整信息。

## 卡号识别及特殊规则
- CHINA T-UNION: 31 开头 19 位，固定显示银行 CHINA T-UNION，有效期强制 12/99
- eCNY: 0 开头 16 位，CVV 固定 000，有效期 12/99
- 其它受支持组织：使用 Luhn + 长度校验
- 未识别模式：允许 1-80 位纯数字（更自由的自定义/虚拟卡）

## 二因素认证重置流程
1. 用户提供旧验证码调用 POST /2fa/reset/init -> 生成临时新 secret (temp_totp_secret) 与二维码
2. 用户使用新秘钥生成验证码调用 POST /2fa/reset/confirm -> 替换正式 totp_secret

## 备份接口使用示例
```bash
curl -X POST http://localhost:3000/backup \
  -H "Authorization: Bearer <token>" \
  -H "x-totp: <code>" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-webdav.example/remote.php/dav/files/user/","username":"user","password":"pass","subdir":"card_backups"}'
```
返回示例：
```json
{"message":"Backup completed successfully","path":"card_backups/cardmanager_backup_20250101_101530.sqlite"}
```

## 构建生产前端
```bash
cd client
npm run build
# 生成文件位于 client/dist/
```
将 `client/dist` 部署到任意静态资源服务器（Nginx、CDN、静态托管等）。

## 自动化批量测试 (server_test.py)
脚本 `server_test.py` 可在根目录批量生成多组织测试卡并调用 `/cards` 创建接口，验证服务端是否正常。

安装依赖（可选，若无 requests 将回退到 urllib）：
```bash
pip install requests
```

使用示例：
```bash
# 导出登录后获得的 JWT
export TOKEN="<你的JWT>"
# 全量测试所有支持的卡组织
python server_test.py --base-url http://localhost:3000
# 仅测试 visa / mastercard / unionpay
python server_test.py --only visa,mastercard,unionpay
# 跳过 amex 与 maestro，并输出详细响应
python server_test.py --skip amex,maestro -v
# 列出支持的网络
python server_test.py --list
# 仅查看将发送的数据（不真正请求）
python server_test.py --dry-run --only mir,jcb
# 多轮创建测试
python server_test.py --only visa,mastercard --rounds 5 -v
# 同时测试 FPS 账户（每轮为所有银行各创建一个账户）
python server_test.py --fps -v
# 指定自定义 FPS 银行子集
python server_test.py --fps --fps-banks "HSBC,BOC,ICBC"
```
支持的网络：visa, mastercard, unionpay, mir, amex, ecny, tunion, jcb, discover, diners, maestro

新增 FPS 参数：
- --fps 启用 FPS 账户测试（创建数量 = 轮数 * 银行数）
- --fps-banks 指定逗号分隔银行（缺省则调用 /fps/banks，失败时用内置列表）

注意：
- eCNY / T-UNION 有效期与 CVV 会被服务端调整为 12/99 与 000（eCNY 固定 000，T-UNION 不展示有效期）。
- Purge 功能（清空信息）会同时删除卡片与 FPS 账户。
- 其它卡组织使用 Luhn 合法随机号；不要用于真实支付测试。
- 创建后脚本会再次调用 GET /cards 输出最新条目。

参数说明：
- --token/-t 或环境变量 TOKEN 指定 JWT
- --base-url/-u 指定服务端地址（默认 http://localhost:3000）
- --only 仅测试逗号分隔列出的网络
- --skip 跳过指定网络
- --dry-run 只打印将发送的 payload
- --verbose/-v 打印详细响应
- --list 仅列出支持网络
- --rounds N  重复执行 N 轮（每轮每种网络 1 张）

UI & 测试更新：
- 清空所有卡片使用自定义模态（非浏览器 prompt），输入主密码与 2FA 验证码。
- Mastercard 2-series 检测与生成修复为官方区间 222100–272099。

## 常见问题 (FAQ)
Q: 数据库文件在哪？
A: `server/data/database.sqlite`（首次运行后生成）。

Q: 如何重置管理员密码？
A: 当前没有区分角色。可停止服务，删除数据库文件重新注册，或直接用 sqlite3 CLI 修改 `users` 表。

Q: 支持多用户隔离吗？
A: 是。`cards` 表 `user_id` 外键绑定，查询均按用户过滤。

## 许可证
[GPL-3.0](LICENSE)

## 共创与 AI 协作
详见 [AI_CO_CREATION.md](AI_CO_CREATION.md)
